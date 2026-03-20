import { existsSync } from 'node:fs';

import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';

import type { CoverageSummary } from '../collector/coverage-collector.js';
import { summarizeCoverage } from '../collector/coverage-collector.js';
import type { RawNetworkEntry } from '../collector/network-collector.js';
import { normalizeNetworkRequest } from '../collector/network-collector.js';
import type { PageMetricRecord, PaintEntryLike } from '../collector/page-metrics-collector.js';
import { normalizePageMetrics } from '../collector/page-metrics-collector.js';
import type { JsExecutionSummary, RawTraceEntry, TraceSummary } from '../collector/trace-collector.js';
import { summarizeJsExecution, summarizeTrace } from '../collector/trace-collector.js';
import type { PageDiagnostics } from '../collector/page-diagnostics-collector.js';
import { buildOversizedImageScript, buildProtocolDistribution, buildRenderBlockingList, buildThirdPartySummary, buildUnusedPreloadList, summarizePageDiagnostics } from '../collector/page-diagnostics-collector.js';
import type { RunJob } from '../queue/run-job.js';
import { launchBrowser } from '../browser/browser-launcher.js';
import { toNetworkConditions } from '../browser/network-profile.js';

type CoverageRangeLike = {
	start: number;
	end: number;
};

type JsCoverageRangeLike = {
	startOffset: number;
	endOffset: number;
	count: number;
};

type JsCoverageFunctionLike = {
	ranges?: JsCoverageRangeLike[];
};

type CoverageEntryLike = {
	url: string;
	text?: string;
	ranges?: CoverageRangeLike[];
	functions?: JsCoverageFunctionLike[];
};

type TraceEventLike = {
	name?: string;
	ph?: string;
	dur?: number;
	ts?: number;
	args?: Record<string, unknown>;
};

type ResponseTimingLike = {
	requestTime?: number;
	dnsStart?: number;
	dnsEnd?: number;
	connectStart?: number;
	connectEnd?: number;
	sslStart?: number;
	sslEnd?: number;
	sendStart?: number;
	sendEnd?: number;
	receiveHeadersStart?: number;
	receiveHeadersEnd?: number;
};

type InitiatorLike = {
	type?: string;
	url?: string;
	stack?: {
		callFrames?: Array<{ url?: string }>;
		parent?: InitiatorLike['stack'];
	};
};

type PageObserverMetrics = {
	lcp?: number;
	cls?: number;
};

type PassLabel = 'cold' | 'warm';

type LiveRunPassResult = {
	label: PassLabel;
	pageMetrics: PageMetricRecord[];
	requests: ReturnType<typeof normalizeNetworkRequest>[];
	traceSummary: TraceSummary;
	jsExecutionSummary: JsExecutionSummary;
	coverageSummary: CoverageSummary;
	pageDiagnostics: PageDiagnostics;
};

type LiveRunPageResult = {
	pageKey: string;
	url: string;
	pageMetrics: PageMetricRecord[];
	requests: ReturnType<typeof normalizeNetworkRequest>[];
	traceSummary: TraceSummary;
	jsExecutionSummary: JsExecutionSummary;
	coverageSummary: CoverageSummary;
	pageDiagnostics: PageDiagnostics;
	passes: Array<{
		label: PassLabel;
		pageMetrics: PageMetricRecord[];
		requests: ReturnType<typeof normalizeNetworkRequest>[];
		traceSummary?: TraceSummary;
		jsExecutionSummary?: JsExecutionSummary;
		coverageSummary?: CoverageSummary;
		pageDiagnostics?: PageDiagnostics;
	}>;
};

type LiveRunProfileResult = {
	pageMetrics: PageMetricRecord[];
	requests: ReturnType<typeof normalizeNetworkRequest>[];
	traceSummary: TraceSummary;
	jsExecutionSummary: JsExecutionSummary;
	coverageSummary: CoverageSummary;
	pageDiagnostics: PageDiagnostics;
	passes: Array<{
		label: PassLabel;
		pageMetrics: PageMetricRecord[];
		requests: ReturnType<typeof normalizeNetworkRequest>[];
		traceSummary?: TraceSummary;
		jsExecutionSummary?: JsExecutionSummary;
		coverageSummary?: CoverageSummary;
		pageDiagnostics?: PageDiagnostics;
	}>;
	pages: LiveRunPageResult[];
	repeatCount?: number;
};

type RequestMapEntry = RawNetworkEntry & {
	startTs?: number;
	endTs?: number;
	responseTiming?: ResponseTimingLike;
};

function sumUsedBytes(ranges: CoverageRangeLike[]): number
{
	return ranges.reduce((total, range) => total + Math.max(0, range.end - range.start), 0);
}

function toNonNegativeNumber(value: unknown): number | undefined
{
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: undefined;
}

function durationBetween(start?: number, end?: number): number | undefined
{
	if (start === undefined || end === undefined || end < start)
	{
		return undefined;
	}

	return Math.max(0, end - start);
}

function firstNonNegative(values: Array<number | undefined>): number | undefined
{
	return values.find((value) => value !== undefined);
}

function roundMs(value: number | undefined): number | undefined
{
	return value === undefined
		? undefined
		: Math.round(value * 1000) / 1000;
}

function normalizeTraceUrlCandidate(value: unknown): string | undefined
{
	if (typeof value !== 'string')
	{
		return undefined;
	}

	const normalized = value.trim();

	if (
		normalized === ''
		|| normalized.startsWith('VM')
		|| normalized.startsWith('extensions::')
	)
	{
		return undefined;
	}

	return normalized;
}

function normalizeComparableAssetUrl(assetUrl: string): string
{
	try
	{
		const parsedUrl = new URL(assetUrl);

		return `${parsedUrl.origin}${parsedUrl.pathname}`;
	}
	catch
	{
		return assetUrl.split('?')[0] ?? assetUrl;
	}
}

function findUrlInCallFrames(frames: unknown): string | undefined
{
	if (!Array.isArray(frames))
	{
		return undefined;
	}

	for (const frame of frames)
	{
		if (!frame || typeof frame !== 'object')
		{
			continue;
		}

		const candidate = frame as { url?: unknown };
		const nextUrl = normalizeTraceUrlCandidate(candidate.url);

		if (nextUrl)
		{
			return nextUrl;
		}
	}

	return undefined;
}

function findUrlInStackTrace(stackTrace: unknown, depth = 0): string | undefined
{
	if (depth > 50)
	{
		return undefined;
	}

	if (!stackTrace || typeof stackTrace !== 'object')
	{
		return undefined;
	}

	const candidate = stackTrace as {
		callFrames?: unknown;
		parent?: unknown;
	};

	return findUrlInCallFrames(candidate.callFrames) ?? findUrlInStackTrace(candidate.parent, depth + 1);
}

function matchScriptUrl(candidateUrl: string, scriptRequests: RequestMapEntry[]): string
{
	const directMatch = scriptRequests.find((request) => request.url === candidateUrl)?.url;

	if (directMatch)
	{
		return directMatch;
	}

	const normalizedCandidate = normalizeComparableAssetUrl(candidateUrl);
	const normalizedMatch = scriptRequests.find((request) => normalizeComparableAssetUrl(request.url) === normalizedCandidate)?.url;

	return normalizedMatch ?? candidateUrl;
}

function extractTraceEventUrl(
	event: TraceEventLike,
	scriptRequests: RequestMapEntry[],
): {
	url?: string;
	confidence?: 'high' | 'medium';
}
{
	const args = event.args as {
		data?: Record<string, unknown>;
		beginData?: Record<string, unknown>;
		stackTrace?: unknown;
	} | undefined;
	const directCandidates = [
		args?.data?.url,
		args?.data?.scriptName,
		args?.data?.scriptUrl,
		args?.data?.sourceURL,
		args?.beginData?.url,
		args?.beginData?.scriptName,
		args?.beginData?.scriptUrl,
	];

	for (const candidate of directCandidates)
	{
		const url = normalizeTraceUrlCandidate(candidate);

		if (url)
		{
			return {
				url: matchScriptUrl(url, scriptRequests),
				confidence: 'high',
			};
		}
	}

	const frameUrl = findUrlInCallFrames(args?.data?.callFrames)
		?? findUrlInStackTrace(args?.data?.stackTrace)
		?? findUrlInStackTrace(args?.beginData?.stackTrace)
		?? findUrlInStackTrace(args?.stackTrace);

	if (!frameUrl)
	{
		return {};
	}

	return {
		url: matchScriptUrl(frameUrl, scriptRequests),
		confidence: 'medium',
	};
}

function inferTraceEventUrlFromRequests(
	event: TraceEventLike,
	scriptRequests: RequestMapEntry[],
): string | undefined
{
	if (typeof event.ts !== 'number' || scriptRequests.length === 0)
	{
		return undefined;
	}

	const eventStartTs = event.ts / 1_000_000;
	const eventEndTs = typeof event.dur === 'number'
		? (event.ts + event.dur) / 1_000_000
		: eventStartTs;
	const overlapMatch = scriptRequests
		.filter((request) => typeof request.startTs === 'number' && typeof request.endTs === 'number')
		.filter((request) => eventEndTs >= request.startTs! - 0.05 && eventStartTs <= request.endTs! + 2)
		.sort((left, right) => {
			const leftGap = left.endTs! >= eventStartTs ? 0 : eventStartTs - left.endTs!;
			const rightGap = right.endTs! >= eventStartTs ? 0 : eventStartTs - right.endTs!;

			return leftGap - rightGap || right.endTs! - left.endTs!;
		})[0];

	if (overlapMatch)
	{
		return overlapMatch.url;
	}

	return scriptRequests
		.filter((request) => typeof request.endTs === 'number' && request.endTs <= eventStartTs && eventStartTs - request.endTs <= 2)
		.sort((left, right) => right.endTs! - left.endTs!)[0]
		?.url;
}

export function extractUsedBytesFromCoverageEntry(entry: CoverageEntryLike): number
{
	if (Array.isArray(entry.ranges))
	{
		return sumUsedBytes(entry.ranges);
	}

	if (Array.isArray(entry.functions))
	{
		return entry.functions.reduce((total, fn) => total + (fn.ranges ?? []).reduce(
			(functionTotal, range) => functionTotal + (range.count > 0 ? Math.max(0, range.endOffset - range.startOffset) : 0),
			0,
		), 0);
	}

	return 0;
}

export function normalizeInitiatorType(value: unknown): RawNetworkEntry['initiatorType']
{
	if (typeof value !== 'string')
	{
		return undefined;
	}

	const normalized = value.toLowerCase();

	if (
		normalized === 'parser'
		|| normalized === 'script'
		|| normalized === 'preload'
		|| normalized === 'fetch'
		|| normalized === 'xmlhttprequest'
	)
	{
		return normalized;
	}

	return 'other';
}

export function extractInitiatorUrl(initiator: InitiatorLike | undefined): string | undefined
{
	if (!initiator)
	{
		return undefined;
	}

	if (typeof initiator.url === 'string' && initiator.url.trim() !== '')
	{
		return initiator.url;
	}

	const callFrames = initiator.stack?.callFrames ?? [];
	const frameUrl = callFrames.find((frame) => typeof frame.url === 'string' && frame.url.trim() !== '')?.url;

	if (frameUrl)
	{
		return frameUrl;
	}

	if (initiator.stack?.parent)
	{
		return extractInitiatorUrl({
			stack: initiator.stack.parent,
		});
	}

	return undefined;
}

export function buildRequestTimingBreakdown(input: {
	startTs?: number;
	endTs?: number;
	baselineStartTs?: number;
	responseTiming?: ResponseTimingLike;
}): Pick<
	RawNetworkEntry,
	| 'startTimeMs'
	| 'endTimeMs'
	| 'queueingMs'
	| 'dnsMs'
	| 'connectMs'
	| 'sslMs'
	| 'requestSentMs'
	| 'waitingMs'
	| 'downloadMs'
>
{
	const responseTiming = input.responseTiming;
	const startTimeMs = input.startTs !== undefined && input.baselineStartTs !== undefined
		? Math.max(0, (input.startTs - input.baselineStartTs) * 1000)
		: undefined;
	const endTimeMs = input.endTs !== undefined && input.baselineStartTs !== undefined
		? Math.max(0, (input.endTs - input.baselineStartTs) * 1000)
		: undefined;
	const dnsStart = toNonNegativeNumber(responseTiming?.dnsStart);
	const dnsEnd = toNonNegativeNumber(responseTiming?.dnsEnd);
	const connectStart = toNonNegativeNumber(responseTiming?.connectStart);
	const connectEnd = toNonNegativeNumber(responseTiming?.connectEnd);
	const sslStart = toNonNegativeNumber(responseTiming?.sslStart);
	const sslEnd = toNonNegativeNumber(responseTiming?.sslEnd);
	const sendStart = toNonNegativeNumber(responseTiming?.sendStart);
	const sendEnd = toNonNegativeNumber(responseTiming?.sendEnd);
	const receiveHeadersStart = toNonNegativeNumber(responseTiming?.receiveHeadersStart);
	const receiveHeadersEnd = toNonNegativeNumber(responseTiming?.receiveHeadersEnd);
	const queueingMs = firstNonNegative([
		dnsStart,
		connectStart,
		sendStart,
		receiveHeadersStart,
		receiveHeadersEnd,
	]);
	const dnsMs = durationBetween(dnsStart, dnsEnd);
	const sslMs = durationBetween(sslStart, sslEnd);
	const rawConnectMs = durationBetween(connectStart, connectEnd);
	const connectMs = rawConnectMs !== undefined
		? Math.max(0, rawConnectMs - (sslMs ?? 0))
		: undefined;
	const requestSentMs = durationBetween(sendStart, sendEnd);
	const waitingMs = durationBetween(sendEnd, receiveHeadersStart);
	const downloadMs = responseTiming?.requestTime !== undefined && receiveHeadersEnd !== undefined && input.endTs !== undefined
		? Math.max(0, (input.endTs - (responseTiming.requestTime + receiveHeadersEnd / 1000)) * 1000)
		: undefined;

	return {
		startTimeMs: roundMs(startTimeMs),
		endTimeMs: roundMs(endTimeMs),
		queueingMs: roundMs(queueingMs),
		dnsMs: roundMs(dnsMs),
		connectMs: roundMs(connectMs),
		sslMs: roundMs(sslMs),
		requestSentMs: roundMs(requestSentMs),
		waitingMs: roundMs(waitingMs),
		downloadMs: roundMs(downloadMs),
	};
}

async function applyNetworkSettings(cdp: CDPSession, job: RunJob): Promise<void>
{
	await cdp.send('Network.enable');
	await cdp.send('Performance.enable');

	if (job.throttling !== 'native')
	{
		await cdp.send('Network.emulateNetworkConditions', toNetworkConditions({
			throttling: job.throttling,
		}));
	}
}

async function createContext(browser: Browser, job: RunJob): Promise<BrowserContext>
{
	return browser.newContext({
		ignoreHTTPSErrors: true,
		viewport: { width: 1440, height: 900 },
		storageState: job.authStatePath && existsSync(job.authStatePath)
			? job.authStatePath
			: undefined,
	});
}

async function installPageObservers(page: Page): Promise<void>
{
	await page.addInitScript(() => {
		type WebPerfWindow = Window & {
			__webperfMetrics?: {
				lcp?: number;
				cls: number;
			};
		};

		const runtimeWindow = window as WebPerfWindow;
		runtimeWindow.__webperfMetrics = {
			lcp: undefined,
			cls: 0,
		};

		try
		{
			new PerformanceObserver((entryList) => {
				for (const entry of entryList.getEntries())
				{
					runtimeWindow.__webperfMetrics!.lcp = entry.startTime;
				}
			}).observe({ type: 'largest-contentful-paint', buffered: true });
		}
		catch {}

		try
		{
			new PerformanceObserver((entryList) => {
				for (const entry of entryList.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>)
				{
					if (!entry.hadRecentInput)
					{
						runtimeWindow.__webperfMetrics!.cls += entry.value ?? 0;
					}
				}
			}).observe({ type: 'layout-shift', buffered: true });
		}
		catch {}
	});
}

async function executeWarmupPass(context: BrowserContext, targetUrl: string): Promise<void>
{
	const page = await context.newPage();

	try
	{
		await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
	}
	finally
	{
		await page.close();
	}
}

async function startTracing(cdp: CDPSession): Promise<{
	events: TraceEventLike[];
	stop: () => Promise<TraceEventLike[]>;
}>
{
	const events: TraceEventLike[] = [];
	let resolveComplete: ((value: TraceEventLike[]) => void) | null = null;
	const completePromise = new Promise<TraceEventLike[]>((resolve) => {
		resolveComplete = resolve;
	});

	cdp.on('Tracing.dataCollected', (payload: { value?: TraceEventLike[] }) => {
		events.push(...(payload.value ?? []));
	});
	cdp.on('Tracing.tracingComplete', () => {
		resolveComplete?.(events);
	});

	await cdp.send('Tracing.start', {
		categories: [
			'devtools.timeline',
			'toplevel',
			'loading',
			'v8.execute',
			'blink.user_timing',
			'disabled-by-default-devtools.timeline.stack',
		].join(','),
		transferMode: 'ReportEvents',
	});

	return {
		events,
		stop: async () => {
			await cdp.send('Tracing.end');

			return completePromise;
		},
	};
}

function buildTraceEntries(requestMap: Map<string, RequestMapEntry>, traceEvents: TraceEventLike[]): RawTraceEntry[]
{
	const entries: RawTraceEntry[] = [...requestMap.values()]
		.filter((entry) => entry.url && typeof entry.startTs === 'number' && typeof entry.endTs === 'number')
		.map((entry) => ({
			name: 'ResourceSendRequest',
			url: entry.url,
			duration: Math.max(0, (entry.endTs! - entry.startTs!) * 1000),
		}));
	const scriptRequests = [...requestMap.values()].filter((entry) => entry.resourceType === 'script' && entry.url.startsWith('http'));

	for (const event of traceEvents)
	{
		if (event.ph !== 'X' || typeof event.name !== 'string' || typeof event.dur !== 'number')
		{
			continue;
		}

		const baseEntry: RawTraceEntry = {
			name: event.name,
			duration: event.dur / 1000,
			ts: event.ts !== undefined ? event.ts / 1000 : undefined,
		};
		const isScriptExecutionEvent = (
			event.name === 'CompileScript'
			|| event.name === 'V8.CompileCode'
			|| event.name === 'EvaluateScript'
			|| event.name === 'FunctionCall'
			|| event.name === 'V8.Execute'
		);

		if (isScriptExecutionEvent)
		{
			const directAttribution = extractTraceEventUrl(event, scriptRequests);
			const inferredUrl = directAttribution.url
				? undefined
				: inferTraceEventUrlFromRequests(event, scriptRequests);

			baseEntry.url = directAttribution.url ?? inferredUrl;
			baseEntry.attributionConfidence = directAttribution.confidence ?? (inferredUrl ? 'low' : undefined);
		}

		if (event.name === 'Layout' || event.name === 'UpdateLayoutTree')
		{
			const args = event.args as { beginData?: { stackTrace?: unknown } } | undefined;
			if (args?.beginData?.stackTrace)
			{
				baseEntry.hasForcingStackTrace = true;
			}

			if (baseEntry.hasForcingStackTrace)
			{
				const directAttribution = extractTraceEventUrl(event, scriptRequests);
				baseEntry.url = directAttribution.url;
			}
		}

		entries.push(baseEntry);
	}

	for (const event of traceEvents)
	{
		if (event.name === 'LayoutShift' && event.ph === 'I')
		{
			const data = (event.args as any)?.data;
			if (data && typeof data === 'object')
			{
				const score = typeof data.score === 'number' ? data.score : undefined;
				const sources = Array.isArray(data.impacted_nodes)
					? data.impacted_nodes.map((n: any) => n.node_name ?? String(n.old_rect ?? '')).filter(Boolean)
					: undefined;

				if (score !== undefined)
				{
					entries.push({
						name: 'LayoutShift',
						duration: 0,
						ts: event.ts !== undefined ? event.ts / 1000 : undefined,
						layoutShiftValue: score,
						layoutShiftSources: sources?.length ? sources : undefined,
					});
				}
			}
		}
	}

	return entries;
}

function buildTraceAnalysis(requestMap: Map<string, RequestMapEntry>, traceEvents: TraceEventLike[]): {
	traceSummary: TraceSummary;
	jsExecutionSummary: JsExecutionSummary;
}
{
	const entries = buildTraceEntries(requestMap, traceEvents);

	return {
		traceSummary: summarizeTrace(entries),
		jsExecutionSummary: summarizeJsExecution(entries),
	};
}

function buildCoverageSummary(jsCoverage: CoverageEntryLike[], cssCoverage: CoverageEntryLike[]): CoverageSummary
{
	return summarizeCoverage([
		...jsCoverage.map((entry) => ({
			url: entry.url,
			type: 'js' as const,
			totalBytes: entry.text?.length ?? 0,
			usedBytes: extractUsedBytesFromCoverageEntry(entry),
		})),
		...cssCoverage.map((entry) => ({
			url: entry.url,
			type: 'css' as const,
			totalBytes: entry.text?.length ?? 0,
			usedBytes: extractUsedBytesFromCoverageEntry(entry),
		})),
	]);
}

function finalizeRequests(requestMap: Map<string, RequestMapEntry>): ReturnType<typeof normalizeNetworkRequest>[]
{
	const baselineStartTs = [...requestMap.values()]
		.map((item) => item.startTs)
		.filter((value): value is number => typeof value === 'number')
		.reduce<number | undefined>((currentMin, value) => currentMin === undefined ? value : Math.min(currentMin, value), undefined);

	for (const item of requestMap.values())
	{
		if (!item.decodedBodySize)
		{
			item.decodedBodySize = item.encodedBodySize;
		}

		if (typeof item.startTs === 'number' && typeof item.endTs === 'number')
		{
			item.durationMs = Math.max(0, (item.endTs - item.startTs) * 1000);
		}

		Object.assign(item, buildRequestTimingBreakdown({
			startTs: item.startTs,
			endTs: item.endTs,
			baselineStartTs,
			responseTiming: item.responseTiming,
		}));
	}

	return [...requestMap.values()]
		.filter((entry) => entry.url.startsWith('http'))
		.map((entry) => normalizeNetworkRequest(entry));
}

async function executeMeasuredPass(
	context: BrowserContext,
	job: RunJob,
	targetUrl: string,
	label: PassLabel,
): Promise<LiveRunPassResult>
{
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	const requestMap = new Map<string, RequestMapEntry>();

	try
	{
		await installPageObservers(page);
		await applyNetworkSettings(cdp, job);

		cdp.on('Network.requestWillBeSent', (event: any) => {
			requestMap.set(event.requestId, {
				url: event.request.url,
				method: event.request.method,
				status: 0,
				resourceType: String(event.type ?? 'other').toLowerCase(),
				transferSize: 0,
				encodedBodySize: 0,
				decodedBodySize: 0,
				startTs: event.timestamp,
				initiatorType: normalizeInitiatorType(event.initiator?.type),
				initiatorUrl: extractInitiatorUrl(event.initiator),
				redirectParentUrl: typeof event.redirectResponse?.url === 'string'
					? event.redirectResponse.url
					: undefined,
				priority: typeof event.initialPriority === 'string'
					? event.initialPriority
					: typeof event.request?.initialPriority === 'string'
						? event.request.initialPriority
						: undefined,
			});
		});

		cdp.on('Network.responseReceived', (event: any) => {
			const item = requestMap.get(event.requestId);

			if (!item)
			{
				return;
			}

			item.status = event.response.status;
			item.resourceType = String(event.type ?? item.resourceType).toLowerCase();
			item.fromDiskCache = event.response.fromDiskCache;
			item.fromMemoryCache = event.response.fromPrefetchCache ?? false;
			item.revalidated = false;
			item.responseHeaders = Object.fromEntries(
				Object.entries(event.response.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
			);
			item.responseTiming = event.response.timing;
			item.protocol = typeof event.response.protocol === 'string' ? event.response.protocol : undefined;
			item.priority = typeof event.response.priority === 'string'
				? event.response.priority
				: item.priority;
		});

		cdp.on('Network.dataReceived', (event: any) => {
			const item = requestMap.get(event.requestId);

			if (!item)
			{
				return;
			}

			item.decodedBodySize += Math.max(0, Math.round(event.dataLength ?? 0));
		});

		cdp.on('Network.loadingFinished', (event: any) => {
			const item = requestMap.get(event.requestId);

			if (!item)
			{
				return;
			}

			item.transferSize = Math.max(0, Math.round(event.encodedDataLength));
			item.encodedBodySize = item.transferSize;
			item.endTs = event.timestamp;
		});

		await page.coverage.startJSCoverage({ resetOnNavigation: true });
		await page.coverage.startCSSCoverage({ resetOnNavigation: true });

		const tracing = await startTracing(cdp);

		await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

		const pageDiagnosticsRaw = await page.evaluate(() =>
		{
			const allNodes = document.querySelectorAll('*');
			let maxDepth = 0;
			for (const node of allNodes)
			{
				let depth = 0;
				let current: Element | null = node;
				while (current)
				{
					depth++;
					current = current.parentElement;
				}
				if (depth > maxDepth)
				{
					maxDepth = depth;
				}
			}

			const dpr = window.devicePixelRatio || 1;
			const images = Array.from(document.querySelectorAll('img[src]'));
			const oversizedImages = images.flatMap((img) =>
			{
				const nw = img.naturalWidth, nh = img.naturalHeight;
				const dw = img.clientWidth, dh = img.clientHeight;
				if (nw === 0 || nh === 0 || dw === 0 || dh === 0)
				{
					return [];
				}

				// Ideal pixel size = display size × DPR (accounts for retina)
				const idealW = Math.round(dw * dpr);
				const idealH = Math.round(dh * dpr);
				const natPx = nw * nh;
				const idealPx = idealW * idealH;

				// Only flag if natural is >20% larger than ideal (allows small variance)
				if (natPx <= idealPx * 1.2)
				{
					return [];
				}

				const wasted = natPx - idealPx;
				const src = img.currentSrc || img.src;
				const ext = src.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
				const bpp: Record<string, number> = { png: 1.0, gif: 0.5, jpg: 0.3, jpeg: 0.3, webp: 0.15, avif: 0.1, svg: 0 };
				const bytesPerPixel = bpp[ext] ?? 0.3;

				if (ext === 'svg')
				{
					return [];
				}

				return [{
					url: src,
					naturalWidth: nw, naturalHeight: nh,
					displayWidth: dw, displayHeight: dh,
					recommendedWidth: idealW, recommendedHeight: idealH,
					dpr: Math.round(dpr * 100) / 100,
					format: ext,
					hasSrcset: img.hasAttribute('srcset') || !!img.closest('picture'),
					wastedPixels: wasted,
					estimatedWastedBytes: Math.round(wasted * bytesPerPixel),
				}];
			}).sort((a, b) => b.estimatedWastedBytes - a.estimatedWastedBytes);

			return {
				domNodeCount: allNodes.length,
				domTreeDepth: maxDepth,
				oversizedImages,
			};
		});

		const perfMetrics = await cdp.send('Performance.getMetrics');
		const heapUsed = (perfMetrics as any).metrics?.find((m: any) => m.name === 'JSHeapUsedSize')?.value ?? 0;
		const heapTotal = (perfMetrics as any).metrics?.find((m: any) => m.name === 'JSHeapTotalSize')?.value ?? 0;

		const listenerCountResult = await cdp.send('Runtime.evaluate', {
			expression: `(() => {
				let count = 0;
				const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
				while (walker.nextNode()) {
					const el = walker.currentNode;
					try { count += getEventListeners(el) ? Object.keys(getEventListeners(el)).reduce((s, k) => s + getEventListeners(el)[k].length, 0) : 0; } catch {}
				}
				return count;
			})()`,
			includeCommandLineAPI: true,
			returnByValue: true,
		} as any);
		const eventListenerCount = (listenerCountResult as any).result?.value ?? 0;

		const timing = await page.evaluate(() => {
			type WebPerfWindow = Window & {
				__webperfMetrics?: {
					lcp?: number;
					cls: number;
				};
			};

			const runtimeWindow = window as WebPerfWindow;
			const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
			const paintEntries = performance.getEntriesByType('paint').map((entry) => ({
				name: entry.name,
				startTime: entry.startTime,
			}));

			return {
				navigationEntry: navigationEntry ? {
					responseStart: navigationEntry.responseStart,
					domContentLoadedEventEnd: navigationEntry.domContentLoadedEventEnd,
					loadEventEnd: navigationEntry.loadEventEnd,
				} : undefined,
				paintEntries,
				pageObserverMetrics: runtimeWindow.__webperfMetrics ?? {
					lcp: undefined,
					cls: 0,
				},
			};
		});

		const jsCoverage = await page.coverage.stopJSCoverage();
		const cssCoverage = await page.coverage.stopCSSCoverage();
		const traceEvents = await tracing.stop();
		const requests = finalizeRequests(requestMap);
		const traceAnalysis = buildTraceAnalysis(requestMap, traceEvents);

		const thirdParty = buildThirdPartySummary({
			targetOrigin: new URL(targetUrl).origin,
			requests: requests.map((r) => ({ url: r.url, transferSize: r.transferSize })),
			jsExecutionResources: traceAnalysis.jsExecutionSummary.resources.map((r) => ({ url: r.url, totalMs: r.totalMs })),
		});

		const fcpMetric = normalizePageMetrics({
			navigationEntry: timing.navigationEntry,
			paintEntries: timing.paintEntries as PaintEntryLike[],
		}).find((m) => m.name === 'fcp');

		const renderBlocking = buildRenderBlockingList({
			requests: requests.map((r) => ({
				url: r.url,
				resourceType: r.resourceType,
				durationMs: r.durationMs,
				transferSize: r.transferSize,
				initiatorType: r.initiatorType,
				startTimeMs: r.startTimeMs,
			})),
			fcpMs: fcpMetric?.value,
		});

		const protocolDistribution = buildProtocolDistribution({
			requests: requests.map((r) => ({
				protocol: r.protocol,
				transferSize: r.transferSize,
			})),
		});

		const preloadedUrls = requests
			.filter((r) => r.initiatorType === 'preload' || r.initiatorType === 'link-preload')
			.map((r) => r.url);
		const unusedPreloads = buildUnusedPreloadList({
			preloadedUrls,
			requestUrls: requests.map((r) => r.url),
		});

		const pageDiagnostics = summarizePageDiagnostics({
			domNodeCount: pageDiagnosticsRaw.domNodeCount,
			domTreeDepth: pageDiagnosticsRaw.domTreeDepth,
			eventListenerCount,
			jsHeapUsedBytes: heapUsed,
			jsHeapTotalBytes: heapTotal,
			oversizedImages: pageDiagnosticsRaw.oversizedImages,
			thirdParty,
			renderBlocking,
			protocolDistribution,
			unusedPreloads,
		});

		return {
			label,
			pageMetrics: normalizePageMetrics({
				navigationEntry: timing.navigationEntry,
				paintEntries: timing.paintEntries as PaintEntryLike[],
				largestContentfulPaint: (timing.pageObserverMetrics as PageObserverMetrics)?.lcp,
				cumulativeLayoutShift: (timing.pageObserverMetrics as PageObserverMetrics)?.cls,
			}),
			requests,
			traceSummary: traceAnalysis.traceSummary,
			jsExecutionSummary: traceAnalysis.jsExecutionSummary,
			coverageSummary: buildCoverageSummary(jsCoverage, cssCoverage),
			pageDiagnostics,
		};
	}
	finally
	{
		await page.close();
	}
}

function selectPrimaryPass(cacheMode: RunJob['cacheMode'], passes: LiveRunPassResult[]): LiveRunPassResult
{
	if (cacheMode === 'warm')
	{
		return passes.find((pass) => pass.label === 'warm') ?? passes[passes.length - 1];
	}

	return passes[0];
}

async function executePageRun(browser: Browser, job: RunJob, targetUrl: string): Promise<LiveRunPageResult>
{
	const context = await createContext(browser, job);

	try
	{
		const measuredPasses: LiveRunPassResult[] = [];

		if (job.cacheMode === 'warm')
		{
			await executeWarmupPass(context, targetUrl);
			measuredPasses.push(await executeMeasuredPass(context, job, targetUrl, 'warm'));
		}
		else if (job.cacheMode === 'both')
		{
			measuredPasses.push(await executeMeasuredPass(context, job, targetUrl, 'cold'));
			measuredPasses.push(await executeMeasuredPass(context, job, targetUrl, 'warm'));
		}
		else
		{
			measuredPasses.push(await executeMeasuredPass(context, job, targetUrl, 'cold'));
		}

		const primaryPass = selectPrimaryPass(job.cacheMode, measuredPasses);

		return {
			pageKey: targetUrl,
			url: targetUrl,
			pageMetrics: primaryPass.pageMetrics,
			requests: primaryPass.requests,
			traceSummary: primaryPass.traceSummary,
			jsExecutionSummary: primaryPass.jsExecutionSummary,
			coverageSummary: primaryPass.coverageSummary,
			pageDiagnostics: primaryPass.pageDiagnostics,
			passes: measuredPasses.map((pass) => ({
				label: pass.label,
				pageMetrics: pass.pageMetrics,
				requests: pass.requests,
				traceSummary: pass.traceSummary,
				jsExecutionSummary: pass.jsExecutionSummary,
				coverageSummary: pass.coverageSummary,
				pageDiagnostics: pass.pageDiagnostics,
			})),
		};
	}
	finally
	{
		await context.close();
	}
}

function computePercentile(values: number[], percentile: number): number
{
	if (values.length === 0)
	{
		return 0;
	}

	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((percentile / 100) * sorted.length) - 1;

	return sorted[Math.max(0, index)];
}

function aggregateMetrics(
	allRuns: Array<Array<{ name: string; value: number }>>,
): Array<{ name: string; value: number }>
{
	if (allRuns.length <= 1)
	{
		return allRuns[0] ?? [];
	}

	const byName = new Map<string, number[]>();

	for (const run of allRuns)
	{
		for (const metric of run)
		{
			const existing = byName.get(metric.name);

			if (existing)
			{
				existing.push(metric.value);
			}
			else
			{
				byName.set(metric.name, [metric.value]);
			}
		}
	}

	return [...byName.entries()].map(([name, values]) => ({
		name,
		value: computePercentile(values, 80),
	}));
}

export async function executeLiveRun(job: RunJob): Promise<LiveRunProfileResult>
{
	const repeatCount = Math.max(1, Math.min(20, job.repeatCount ?? 1));
	const browser = await launchBrowser();

	try
	{
		const targetUrls = job.targetUrls?.length ? job.targetUrls : [job.targetUrl];

		if (repeatCount === 1)
		{
			const pageResults: LiveRunPageResult[] = [];

			for (const targetUrl of targetUrls)
			{
				pageResults.push(await executePageRun(browser, job, targetUrl));
			}

			const primaryPage = pageResults[0] ?? {
				pageKey: job.targetUrl,
				url: job.targetUrl,
				pageMetrics: [],
				requests: [],
				traceSummary: summarizeTrace([]),
				jsExecutionSummary: summarizeJsExecution([]),
				coverageSummary: summarizeCoverage([]),
				pageDiagnostics: summarizePageDiagnostics({}),
				passes: [],
			};

			return {
				pageMetrics: primaryPage.pageMetrics,
				requests: primaryPage.requests,
				traceSummary: primaryPage.traceSummary,
				jsExecutionSummary: primaryPage.jsExecutionSummary,
				coverageSummary: primaryPage.coverageSummary,
				pageDiagnostics: primaryPage.pageDiagnostics,
				passes: primaryPage.passes,
				pages: pageResults,
				repeatCount: 1,
			};
		}

		// Multi-run: execute N times, each in a fresh browser context
		const allPageRuns: LiveRunPageResult[][] = [];

		for (let i = 0; i < repeatCount; i++)
		{
			const pageResults: LiveRunPageResult[] = [];

			for (const targetUrl of targetUrls)
			{
				// Fresh context for each repeat (true cold cache)
				pageResults.push(await executePageRun(browser, job, targetUrl));
			}

			allPageRuns.push(pageResults);
		}

		// Aggregate: for single-page runs, aggregate across repeats
		// For multi-page, aggregate per-page
		const firstRun = allPageRuns[0];
		const pageCount = firstRun.length;
		const aggregatedPages: LiveRunPageResult[] = [];

		for (let pageIndex = 0; pageIndex < pageCount; pageIndex++)
		{
			const runsForPage = allPageRuns.map((run) => run[pageIndex]);
			const allMetrics = runsForPage.map((r) => r.pageMetrics);
			const p80Metrics = aggregateMetrics(allMetrics);

			// Use the median run (closest to p80 load time) for requests/trace/etc.
			const loadValues = runsForPage.map((r) =>
				r.pageMetrics.find((m) => m.name === 'load')?.value ?? 0,
			);
			const p80Load = computePercentile(loadValues, 80);
			const medianRun = runsForPage.reduce((best, run) => {
				const runLoad = run.pageMetrics.find((m) => m.name === 'load')?.value ?? 0;
				const bestLoad = best.pageMetrics.find((m) => m.name === 'load')?.value ?? 0;

				return Math.abs(runLoad - p80Load) < Math.abs(bestLoad - p80Load) ? run : best;
			});

			// All individual runs become passes
			const allPasses = runsForPage.flatMap((run, runIndex) =>
				run.passes.map((pass) => ({
					...pass,
					label: (`${pass.label}-${runIndex + 1}`) as 'cold' | 'warm',
				})),
			);

			aggregatedPages.push({
				pageKey: runsForPage[0].pageKey,
				url: runsForPage[0].url,
				pageMetrics: p80Metrics,
				requests: medianRun.requests,
				traceSummary: medianRun.traceSummary,
				jsExecutionSummary: medianRun.jsExecutionSummary,
				coverageSummary: medianRun.coverageSummary,
				pageDiagnostics: medianRun.pageDiagnostics,
				passes: allPasses,
			});
		}

		const primaryPage = aggregatedPages[0];

		return {
			pageMetrics: primaryPage.pageMetrics,
			requests: primaryPage.requests,
			traceSummary: primaryPage.traceSummary,
			jsExecutionSummary: primaryPage.jsExecutionSummary,
			coverageSummary: primaryPage.coverageSummary,
			pageDiagnostics: primaryPage.pageDiagnostics,
			passes: primaryPage.passes,
			pages: aggregatedPages,
			repeatCount,
		};
	}
	finally
	{
		await browser.close();
	}
}
