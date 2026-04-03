import { normalizeAssetUrl } from '@webperf/shared';

import { detectIssues } from '../issues/rule-engine.js';
import type { ProfileRepository } from '../profiles/profile.repository.types.js';
import type {
	RunRepository,
	PageMetricRecord,
	RequestRecord,
	RunPageRecord,
	RunPassRecord,
} from '../runs/run.repository.types.js';
import type { AssetIssueService } from '../asset-issues/asset-issue.service.js';

type LlmReportPassLabel = 'cold' | 'warm';

function formatMs(value?: number): string
{
	if (value === undefined)
	{
		return 'n/a';
	}

	return `${value.toFixed(1)} ms`;
}

function formatBytes(value: number): string
{
	if (value >= 1024 * 1024)
	{
		return `${(value / (1024 * 1024)).toFixed(2)} MB`;
	}

	if (value >= 1024)
	{
		return `${(value / 1024).toFixed(2)} KB`;
	}

	return `${value} B`;
}

function formatRatio(value: number | null): string
{
	if (value === null || !Number.isFinite(value))
	{
		return 'n/a';
	}

	return `${value.toFixed(2)}x`;
}

function getMetricMap(pageMetrics: PageMetricRecord[]): Map<string, number>
{
	return new Map(pageMetrics.map((metric) => [metric.name.toLowerCase(), metric.value]));
}

function pickPass(
	pageMetrics: PageMetricRecord[],
	requests: RequestRecord[],
	passes: RunPassRecord[] | undefined,
	passLabel?: string,
): { label: LlmReportPassLabel; pageMetrics: PageMetricRecord[]; requests: RequestRecord[] }
{
	if (!passes?.length)
	{
		return {
			label: 'cold',
			pageMetrics,
			requests,
		};
	}

	if (passLabel === 'warm' || passLabel === 'cold')
	{
		const selectedPass = passes.find((pass) => pass.label === passLabel);

		if (selectedPass)
		{
			return selectedPass;
		}
	}

	return passes[0];
}

function pickPage(
	pages: RunPageRecord[] | undefined,
	pageKey?: string,
): RunPageRecord | null
{
	if (!pages?.length)
	{
		return null;
	}

	if (pageKey)
	{
		return pages.find((page) => page.pageKey === pageKey) ?? pages[0];
	}

	return pages[0];
}

export class LlmReportService
{
	constructor(
		private readonly runs: RunRepository,
		private readonly profiles: ProfileRepository,
		private readonly assetIssues: AssetIssueService,
	)
	{
	}

	async build(runId: string, requestedPassLabel?: string, requestedPageKey?: string): Promise<{
		runId: string;
		passLabel: LlmReportPassLabel;
		format: 'markdown';
		generatedAt: string;
		content: string;
	}>
	{
		const run = await this.runs.findById(runId);

		if (!run)
		{
			throw new Error('Run not found');
		}

		const profile = await this.profiles.findById(run.profileId);
		const details = await this.runs.findDetails(runId);
		const selectedPage = pickPage(details.pages, requestedPageKey);
		const pageMetrics = selectedPage?.pageMetrics ?? details.pageMetrics;
		const requests = selectedPage?.requests ?? details.requests;
		const passes = selectedPage?.passes ?? details.passes;
		const traceSummary = selectedPage?.traceSummary ?? details.traceSummary;
		const coverageSummary = selectedPage?.coverageSummary ?? details.coverageSummary;
		const selectedPass = pickPass(pageMetrics, requests, passes, requestedPassLabel);
		const metricMap = getMetricMap(selectedPass.pageMetrics);
		const selectedRequests = selectedPass.requests;
		const totalTransfer = selectedRequests.reduce((sum, request) => sum + request.transferSize, 0);
		const totalEncoded = selectedRequests.reduce((sum, request) => sum + request.encodedBodySize, 0);
		const totalDecoded = selectedRequests.reduce((sum, request) => sum + request.decodedBodySize, 0);
		const topDecodedAssets = [...selectedRequests]
			.sort((left, right) => right.decodedBodySize - left.decodedBodySize)
			.slice(0, 7);
		const slowestRequests = [...selectedRequests]
			.sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
			.slice(0, 7);
		const compressionMix = [...new Set(selectedRequests.map((request) => request.contentEncoding ?? 'none'))];
		const cacheHits = selectedRequests.filter((request) => request.fromDiskCache || request.fromMemoryCache).length;
		const coldPass = passes?.find((pass) => pass.label === 'cold');
		const warmPass = passes?.find((pass) => pass.label === 'warm');
		const coldLoadMs = coldPass
			? (getMetricMap(coldPass.pageMetrics).get('load') ?? 0)
			: (metricMap.get('load') ?? 0);
		const warmLoadMs = warmPass
			? (getMetricMap(warmPass.pageMetrics).get('load') ?? 0)
			: coldLoadMs;
		const issues = detectIssues({
			requests: selectedRequests.map((request) => ({
				...request,
				contentEncoding: request.contentEncoding ?? null,
				renderBlocking: request.resourceType === 'stylesheet',
			})),
			coldLoadMs,
			warmLoadMs,
		});
		const requestAssetKeys = new Set(selectedRequests.map((request) => normalizeAssetUrl(request.url)));
		const allIssues = await this.assetIssues.list();
		const trackedIssues = allIssues.filter((issue) => requestAssetKeys.has(issue.assetKey));
		const lines = [
			'# WebPerf Hub LLM Report',
			'',
			'## Run Context',
			`- Run ID: ${run.id}`,
			`- Run status: ${run.status}`,
			`- Profile: ${profile?.name ?? run.profileId}`,
			`- URL: ${profile?.url ?? 'n/a'}`,
			`- Page in report: ${selectedPage?.url ?? profile?.url ?? 'n/a'}`,
			`- Throttling: ${profile?.throttling ?? 'n/a'}`,
			`- Cache mode: ${profile?.cacheMode ?? 'n/a'}`,
			`- Selected pass: ${selectedPass.label}`,
			`- Created at: ${run.createdAt}`,
			`- Completed at: ${run.completedAt ?? 'n/a'}`,
			'',
			'## Page Stages',
			`- TTFB: ${formatMs(metricMap.get('ttfb'))}`,
			`- FP: ${formatMs(metricMap.get('fp'))}`,
			`- FCP: ${formatMs(metricMap.get('fcp'))}`,
			`- DCL: ${formatMs(metricMap.get('dcl'))}`,
			`- LOAD: ${formatMs(metricMap.get('load'))}`,
			'',
			'## Network Summary',
			`- Request count: ${selectedRequests.length}`,
			`- Transfer total: ${formatBytes(totalTransfer)}`,
			`- Encoded total: ${formatBytes(totalEncoded)}`,
			`- Decoded total: ${formatBytes(totalDecoded)}`,
			`- Compression mix: ${compressionMix.join(', ')}`,
			`- Cache hits: ${cacheHits}`,
			'',
			'## Heavy Assets',
			...topDecodedAssets.map((request) => {
				const expansion = request.encodedBodySize > 0 ? request.decodedBodySize / request.encodedBodySize : null;

				return `- ${normalizeAssetUrl(request.url)} | ${request.resourceType} | decoded ${formatBytes(request.decodedBodySize)} | encoded ${formatBytes(request.encodedBodySize)} | exp ${formatRatio(expansion)} | dur ${formatMs(request.durationMs)}`;
			}),
			'',
			'## Slow Requests',
			...slowestRequests.map((request) => `- ${normalizeAssetUrl(request.url)} | ${request.resourceType} | dur ${formatMs(request.durationMs)} | transfer ${formatBytes(request.transferSize)} | status ${request.status ?? 'n/a'}`),
			'',
			'## Coverage Summary',
			`- JS used: ${formatBytes(coverageSummary?.totals.js.usedBytes ?? 0)}`,
			`- JS unused: ${formatBytes(coverageSummary?.totals.js.unusedBytes ?? 0)}`,
			`- CSS used: ${formatBytes(coverageSummary?.totals.css.usedBytes ?? 0)}`,
			`- CSS unused: ${formatBytes(coverageSummary?.totals.css.unusedBytes ?? 0)}`,
			'',
			'## Trace Summary',
			`- Critical chain entries: ${traceSummary?.criticalChain.length ?? 0}`,
			`- JS parse: ${formatMs(traceSummary?.mainThread.parse)}`,
			`- JS eval: ${formatMs(traceSummary?.mainThread.evaluate)}`,
			`- Main thread layout: ${formatMs(traceSummary?.mainThread.layout)}`,
			`- Main thread paint: ${formatMs(traceSummary?.mainThread.paint)}`,
			`- Main thread other: ${formatMs(traceSummary?.mainThread.other)}`,
			`- Long tasks: ${traceSummary?.mainThread.longTaskCount ?? 0}`,
			`- Long task total: ${formatMs(traceSummary?.mainThread.longTaskTotal)}`,
			'',
			'## Rule Engine Findings',
			...(issues.length > 0
				? issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.evidence}`)
				: ['- none']),
			'',
			'## Mantis Watch',
			...(trackedIssues.length > 0
				? trackedIssues.map((issue) => `- ${issue.assetUrl} | ${issue.status} | ${issue.mantisUrl}${issue.returnedAfterClose ? ' | returned after close' : ''}`)
				: ['- no tracked assets for this run']),
		];

		return {
			runId,
			passLabel: selectedPass.label,
			format: 'markdown',
			generatedAt: new Date().toISOString(),
			content: lines.join('\n'),
		};
	}
}
