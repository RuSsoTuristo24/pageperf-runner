export type OversizedImage = {
	url: string;
	naturalWidth: number;
	naturalHeight: number;
	displayWidth: number;
	displayHeight: number;
	wastedPixels: number;
	estimatedWastedBytes: number;
};

export type ThirdPartyOrigin = {
	origin: string;
	transferBytes: number;
	requestCount: number;
	blockingTimeMs: number;
};

export type ThirdPartySummary = {
	origins: ThirdPartyOrigin[];
	totalTransferBytes: number;
	totalRequests: number;
};

export type RenderBlockingResource = {
	url: string;
	resourceType: string;
	durationMs: number;
	transferBytes: number;
};

export type ProtocolBucket = {
	protocol: string;
	requestCount: number;
	transferBytes: number;
};

export type PageDiagnostics = {
	dom: {
		nodeCount: number;
		treeDepth: number;
		eventListenerCount: number;
	};
	heap: {
		usedBytes: number;
		totalBytes: number;
	};
	oversizedImages: OversizedImage[];
	thirdParty: ThirdPartySummary;
	renderBlocking: RenderBlockingResource[];
	unusedPreloads: string[];
	protocolDistribution: ProtocolBucket[];
};

type RawPageDiagnosticsInput = {
	domNodeCount?: number;
	domTreeDepth?: number;
	eventListenerCount?: number;
	jsHeapUsedBytes?: number;
	jsHeapTotalBytes?: number;
	oversizedImages?: OversizedImage[];
	thirdParty?: ThirdPartySummary;
	renderBlocking?: RenderBlockingResource[];
	unusedPreloads?: string[];
	protocolDistribution?: ProtocolBucket[];
};

function toSafeInt(value: unknown, fallback = 0): number
{
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? Math.round(value)
		: fallback;
}

export function summarizePageDiagnostics(input: RawPageDiagnosticsInput): PageDiagnostics
{
	return {
		dom: {
			nodeCount: toSafeInt(input.domNodeCount),
			treeDepth: toSafeInt(input.domTreeDepth),
			eventListenerCount: toSafeInt(input.eventListenerCount),
		},
		heap: {
			usedBytes: toSafeInt(input.jsHeapUsedBytes),
			totalBytes: toSafeInt(input.jsHeapTotalBytes),
		},
		oversizedImages: input.oversizedImages ?? [],
		thirdParty: input.thirdParty ?? { origins: [], totalTransferBytes: 0, totalRequests: 0 },
		renderBlocking: input.renderBlocking ?? [],
		unusedPreloads: input.unusedPreloads ?? [],
		protocolDistribution: input.protocolDistribution ?? [],
	};
}

type ThirdPartyInput = {
	targetOrigin: string;
	requests: Array<{ url: string; transferSize: number }>;
	jsExecutionResources?: Array<{ url: string; totalMs: number }>;
};

export function buildThirdPartySummary(input: ThirdPartyInput): ThirdPartySummary
{
	const originMap = new Map<string, { transferBytes: number; requestCount: number; blockingTimeMs: number }>();

	for (const request of input.requests)
	{
		let origin: string;
		try
		{
			origin = new URL(request.url).origin;
		}
		catch
		{
			continue;
		}

		if (origin === input.targetOrigin)
		{
			continue;
		}

		const current = originMap.get(origin) ?? { transferBytes: 0, requestCount: 0, blockingTimeMs: 0 };
		current.transferBytes += request.transferSize;
		current.requestCount += 1;
		originMap.set(origin, current);
	}

	for (const resource of input.jsExecutionResources ?? [])
	{
		let origin: string;
		try
		{
			origin = new URL(resource.url).origin;
		}
		catch
		{
			continue;
		}

		const current = originMap.get(origin);
		if (current)
		{
			current.blockingTimeMs += resource.totalMs;
		}
	}

	const origins: ThirdPartyOrigin[] = [...originMap.entries()]
		.map(([origin, data]) => ({ origin, ...data }))
		.sort((a, b) => b.transferBytes - a.transferBytes);

	return {
		origins,
		totalTransferBytes: origins.reduce((sum, o) => sum + o.transferBytes, 0),
		totalRequests: origins.reduce((sum, o) => sum + o.requestCount, 0),
	};
}

type RenderBlockingInput = {
	requests: Array<{
		url: string;
		resourceType: string;
		durationMs?: number;
		transferSize: number;
		initiatorType?: string;
		startTimeMs?: number;
	}>;
	fcpMs?: number;
};

export function buildRenderBlockingList(input: RenderBlockingInput): RenderBlockingResource[]
{
	if (input.fcpMs === undefined || input.fcpMs <= 0)
	{
		return [];
	}

	return input.requests
		.filter((request) => (
			(request.resourceType === 'stylesheet' || request.resourceType === 'script')
			&& request.initiatorType === 'parser'
			&& (request.startTimeMs === undefined || request.startTimeMs < input.fcpMs!)
		))
		.map((request) => ({
			url: request.url,
			resourceType: request.resourceType,
			durationMs: request.durationMs ?? 0,
			transferBytes: request.transferSize,
		}))
		.sort((a, b) => b.durationMs - a.durationMs);
}

type ProtocolInput = {
	requests: Array<{
		protocol?: string;
		transferSize: number;
	}>;
};

export function buildProtocolDistribution(input: ProtocolInput): ProtocolBucket[]
{
	const buckets = new Map<string, { requestCount: number; transferBytes: number }>();

	for (const request of input.requests)
	{
		const protocol = request.protocol ?? 'unknown';
		const current = buckets.get(protocol) ?? { requestCount: 0, transferBytes: 0 };
		current.requestCount += 1;
		current.transferBytes += request.transferSize;
		buckets.set(protocol, current);
	}

	return [...buckets.entries()]
		.map(([protocol, data]) => ({ protocol, ...data }))
		.sort((a, b) => b.requestCount - a.requestCount);
}

type UnusedPreloadInput = {
	preloadedUrls: string[];
	requestUrls: string[];
};

export function buildUnusedPreloadList(input: UnusedPreloadInput): string[]
{
	const requestedSet = new Set(input.requestUrls);

	return input.preloadedUrls.filter((url) => !requestedSet.has(url));
}

export function buildOversizedImageScript(): string
{
	return `(() => {
		const images = Array.from(document.querySelectorAll('img[src]'));
		return images.flatMap(img => {
			const nat = { w: img.naturalWidth, h: img.naturalHeight };
			const disp = { w: img.clientWidth, h: img.clientHeight };
			if (nat.w === 0 || nat.h === 0 || disp.w === 0 || disp.h === 0) return [];
			const natPixels = nat.w * nat.h;
			const dispPixels = disp.w * disp.h;
			if (natPixels <= dispPixels * 2) return [];
			const wasted = natPixels - dispPixels;
			return [{
				url: img.src,
				naturalWidth: nat.w,
				naturalHeight: nat.h,
				displayWidth: disp.w,
				displayHeight: disp.h,
				wastedPixels: wasted,
				estimatedWastedBytes: Math.round(wasted * 0.3),
			}];
		}).sort((a, b) => b.estimatedWastedBytes - a.estimatedWastedBytes);
	})()`;
}
