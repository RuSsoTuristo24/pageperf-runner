import { useEffect, useRef, useState } from 'react';

import { AuthSessionsList } from './features/auth/auth-sessions-list.js';
import { IssueWatch } from './features/asset-issues/issue-watch.js';
import { AssetTable } from './features/assets/asset-table.js';
import { RequestTable } from './features/requests/request-table.js';
import { LongTasksPanel } from './features/diagnostics/long-tasks-panel.js';
import { OversizedImagesPanel } from './features/diagnostics/oversized-images-panel.js';
import { RenderBlockingPanel } from './features/diagnostics/render-blocking-panel.js';
import { ThirdPartyPanel } from './features/diagnostics/third-party-panel.js';
import { JsExecutionPanel } from './features/runs/js-execution-panel.js';
import { RunLaunchForm } from './features/runs/run-launch-form.js';
import { normalizePagesForSubmit } from './features/runs/pages-input.js';
import { RunList } from './features/runs/run-list.js';
import { RunOverview } from './features/runs/run-overview.js';
import { RunTemplatesList } from './features/runs/run-templates-list.js';
import {
	captureAuthSession,
	createProfile,
	createRun,
	createAssetIssue,
	deleteAuthSession,
	deleteRun,
	deleteAssetIssue,
	fetchAppConfig,
	fetchAuthSessions,
	fetchAssetIssues,
	fetchLlmReport,
	fetchProfiles,
	fetchRunDetails,
	fetchRuns,
	hostFromUrl,
	setProfileTemplate,
	startRun,
	type ApiAuthSession,
	type ApiAssetIssue,
	type ApiAppConfig,
	type ApiEnvironment,
	type ApiLlmReport,
	type ApiProfile,
	type ApiRun,
	type ApiRunDetails,
	updateAssetIssue,
} from './lib/api.js';
import {
	formatBytes,
	formatCount,
	formatMetricOrPlaceholder,
	formatMetricValue,
	formatRatio,
} from './lib/format.js';

type RunListItem = {
	id: string;
	page: string;
	profile: string;
	status: string;
	context: string;
	createdAt?: string;
};

type RunPass = {
	label: 'cold' | 'warm';
	pageMetrics: Array<{ name: string; value: number }>;
	requests: ApiRunDetails['requests'];
	traceSummary?: ApiRunDetails['traceSummary'];
	jsExecutionSummary?: ApiRunDetails['jsExecutionSummary'];
	coverageSummary?: ApiRunDetails['coverageSummary'];
	pageDiagnostics?: ApiRunDetails['pageDiagnostics'];
};

type SummaryItem = {
	label: string;
	value: string;
	tone?: 'default' | 'success' | 'warning';
};

type StageItem = {
	label: string;
	value: string;
	offsetPercent: number;
	gapLabel: string;
	status: 'ready' | 'pending';
};

type DeepMetricItem = {
	label: string;
	value: string;
	hint: string;
};

type WorkspaceTab = 'requests' | 'overview' | 'analysis' | 'assets' | 'mantis';
type RunPageRecord = NonNullable<ApiRunDetails['pages']>[number];

type AssetRow = {
	assetKey: string;
	url: string;
	resourceType: string;
	duration: string;
	durationMs: number;
	encoded: string;
	encodedBytes: number;
	decoded: string;
	decodedBytes: number;
	compression: string;
	expansion: string;
	expansionRatio: number | null;
	isHeavy: boolean;
	issue?: ApiAssetIssue;
};

const STAGE_ORDER = ['ttfb', 'fp', 'fcp', 'lcp', 'dcl', 'load'] as const;
const STAGE_LABELS: Record<(typeof STAGE_ORDER)[number], string> = {
	ttfb: 'TTFB',
	fp: 'FP',
	fcp: 'FCP',
	lcp: 'LCP',
	dcl: 'DCL',
	load: 'LOAD',
};

function normalizeAssetUrl(assetUrl: string): string
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

function getPageLabel(url: string): string
{
	try
	{
		const parsedUrl = new URL(url);

		return parsedUrl.pathname || parsedUrl.hostname;
	}
	catch
	{
		return url;
	}
}

function getRunPageOptions(details: ApiRunDetails | null, fallbackUrl?: string | null): RunPageRecord[]
{
	if (details?.pages?.length)
	{
		return details.pages;
	}

	if (!details)
	{
		return [];
	}

	return [
		{
			pageKey: fallbackUrl ?? details.requests[0]?.url ?? 'primary',
			url: fallbackUrl ?? details.requests[0]?.url ?? 'Primary page',
			pageMetrics: details.pageMetrics,
			requests: details.requests,
			traceSummary: details.traceSummary,
			jsExecutionSummary: details.jsExecutionSummary,
			coverageSummary: details.coverageSummary,
			pageDiagnostics: details.pageDiagnostics,
			passes: details.passes ?? [],
		},
	];
}

function buildDeepMetricItems(
	metricMap: Map<string, number>,
	traceSummary: ApiRunDetails['traceSummary'] | RunPageRecord['traceSummary'] | undefined,
	coverageSummary?: ApiRunDetails['coverageSummary'] | RunPageRecord['coverageSummary'],
	pageDiagnostics?: ApiRunDetails['pageDiagnostics'],
): DeepMetricItem[]
{
	const visibleAt = metricMap.get('fcp') ?? metricMap.get('fp');

	return [
		{
			label: 'Visible',
			value: visibleAt !== undefined ? formatMetricValue('fcp', visibleAt) : 'n/a',
			hint: 'Обычно для пользователя первое осмысленное появление страницы ближе всего к FCP. Если FCP недоступен, ориентируемся на FP.',
		},
		{
			label: 'LCP',
			value: formatMetricOrPlaceholder('lcp', metricMap.get('lcp')),
			hint: 'Largest Contentful Paint. Когда отрисовался крупнейший видимый контент первого экрана.',
		},
		{
			label: 'CLS',
			value: formatMetricOrPlaceholder('cls', metricMap.get('cls')),
			hint: 'Cumulative Layout Shift. Насколько страница визуально дёргалась после первоначальной отрисовки.',
		},
		{
			label: 'JS Parse',
			value: traceSummary ? formatMetricValue('parse', traceSummary.mainThread.parse) : 'n/a',
			hint: 'Время разбора JS движком до исполнения. Это не запуск кода, а подготовка скриптов к выполнению.',
		},
		{
			label: 'JS Eval',
			value: traceSummary ? formatMetricValue('evaluate', traceSummary.mainThread.evaluate) : 'n/a',
			hint: 'Время исполнения JS на главном потоке. Это то, что обычно имеют в виду под eval/execute скриптов.',
		},
		{
			label: 'TBT',
			value: traceSummary
				? formatMetricValue('duration', Math.max(0, traceSummary.mainThread.longTaskTotal - traceSummary.mainThread.longTaskCount * 50))
				: 'n/a',
			hint: 'Total Blocking Time. Суммарное время, на которое длинные задачи (>50 мс) блокировали главный поток сверх порога.',
		},
		{
			label: 'Long Tasks',
			value: traceSummary ? `${traceSummary.mainThread.longTaskCount} / ${formatMetricValue('duration', traceSummary.mainThread.longTaskTotal)}` : 'n/a',
			hint: 'Длинные задачи на главном потоке дольше 50 мс. Они блокируют отзывчивость и отрисовку.',
		},
		{
			label: 'JS Coverage',
			value: coverageSummary
				? `${((coverageSummary.totals.js.usedBytes / Math.max(1, coverageSummary.totals.js.usedBytes + coverageSummary.totals.js.unusedBytes)) * 100).toFixed(1)}%`
				: 'n/a',
			hint: 'Процент использованного JS-кода. Остальное — мёртвый код, загруженный, но не выполненный.',
		},
		{
			label: 'CSS Coverage',
			value: coverageSummary
				? `${((coverageSummary.totals.css.usedBytes / Math.max(1, coverageSummary.totals.css.usedBytes + coverageSummary.totals.css.unusedBytes)) * 100).toFixed(1)}%`
				: 'n/a',
			hint: 'Процент использованного CSS-кода. Остальное — неиспользуемые правила, загруженные на страницу.',
		},
		{
			label: 'DOM Nodes',
			value: pageDiagnostics ? formatCount(pageDiagnostics.dom.nodeCount) : 'n/a',
			hint: 'Общее количество DOM-нод на странице. Более 1500 нод замедляет layout и paint.',
		},
		{
			label: 'DOM Depth',
			value: pageDiagnostics ? String(pageDiagnostics.dom.treeDepth) : 'n/a',
			hint: 'Максимальная глубина DOM-дерева. Глубокие деревья увеличивают стоимость CSS-рекалькуляций.',
		},
		{
			label: 'Listeners',
			value: pageDiagnostics ? formatCount(pageDiagnostics.dom.eventListenerCount) : 'n/a',
			hint: 'Количество зарегистрированных event listeners. Много listeners = больше памяти и медленнее GC.',
		},
		{
			label: 'JS Heap',
			value: pageDiagnostics ? formatBytes(pageDiagnostics.heap.usedBytes) : 'n/a',
			hint: 'Объём JS-кучи, занятый объектами. Высокие значения могут указывать на утечки памяти.',
		},
		{
			label: 'Layout Shifts',
			value: traceSummary?.layoutShifts?.length
				? `${traceSummary.layoutShifts.length} / ${traceSummary.layoutShifts.reduce((sum, ls) => sum + ls.value, 0).toFixed(3)}`
				: 'n/a',
			hint: 'Количество отдельных layout shift событий и суммарный CLS score.',
		},
		{
			label: 'Forced Reflows',
			value: traceSummary?.forcedReflows?.length
				? `${traceSummary.forcedReflows.length} / ${formatMetricValue('duration', traceSummary.forcedReflows.reduce((sum, r) => sum + r.durationMs, 0))}`
				: 'n/a',
			hint: 'Синхронные layout-пересчёты, вызванные из JS. Частая причина тормозов при интерактивности.',
		},
	];
}

function pickDefaultRunId(runs: ApiRun[]): string | null
{
	return runs.find((run) => run.status === 'completed')?.id
		?? runs[0]?.id
		?? null;
}

function getMetricMap(pageMetrics: Array<{ name: string; value: number }>): Map<string, number>
{
	return new Map(pageMetrics.map((metric) => [metric.name.toLowerCase(), metric.value]));
}

function buildStageItems(metricMap: Map<string, number>): StageItem[]
{
	const loadMetric = metricMap.get('load') ?? 0;
	const maxValue = loadMetric > 0
		? loadMetric
		: Math.max(...STAGE_ORDER.map((name) => metricMap.get(name) ?? 0), 0);
	let previousValue = 0;

	return STAGE_ORDER.map((name) => {
		const value = metricMap.get(name);
		const isReady = value !== undefined;
		const gap = isReady ? Math.max(0, value - previousValue) : 0;

		if (isReady)
		{
			previousValue = value;
		}

		return {
			label: STAGE_LABELS[name],
			value: formatMetricOrPlaceholder(name, value),
			offsetPercent: isReady && maxValue > 0 ? Math.max(8, (value / maxValue) * 100) : 6,
			gapLabel: isReady ? `+${formatMetricValue(name, gap)}` : 'Ожидание',
			status: isReady ? 'ready' : 'pending',
		};
	});
}

function getCompressionMix(requests: ApiRunDetails['requests']): string
{
	const encodings = new Set(
		requests
			.map((request) => request.contentEncoding ?? 'none')
			.filter(Boolean),
	);

	return [...encodings].join(', ');
}

function toErrorMessage(error: unknown): string
{
	if (error instanceof Error && error.message.trim() !== '')
	{
		return error.message;
	}

	return 'Не удалось загрузить данные pageperf-runner.';
}

function getStatusDisplayLabel(status: string): string
{
	const labels: Record<string, string> = {
		idle: 'нет данных',
		completed: 'завершён',
		running: 'выполняется',
		queued: 'в очереди',
		failed: 'ошибка',
		cancelled: 'отменён',
	};

	return labels[status] ?? status;
}

export function App()
{
	const [profiles, setProfiles] = useState<ApiProfile[]>([]);
	const [runs, setRuns] = useState<ApiRun[]>([]);
	const [authSessions, setAuthSessions] = useState<ApiAuthSession[]>([]);
	const [appConfig, setAppConfig] = useState<ApiAppConfig>({ vncUrl: null });
	const [assetIssues, setAssetIssues] = useState<ApiAssetIssue[]>([]);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [selectedRunDetails, setSelectedRunDetails] = useState<ApiRunDetails | null>(null);
	const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('assets');
	const [requestType, setRequestType] = useState('all');
	const [assetType, setAssetType] = useState('all');
	const [heavyAssetThresholdMb, setHeavyAssetThresholdMb] = useState('1');
	const [useAuthSession, setUseAuthSession] = useState(false);
	const lastAutoAuthHostRef = useRef<string | null | undefined>(undefined);
	const [saveAsTemplate, setSaveAsTemplate] = useState(false);
	const [isPromotingTemplate, setIsPromotingTemplate] = useState(false);
	const [selectedPassLabel, setSelectedPassLabel] = useState<'cold' | 'warm' | null>(null);
	const [selectedPageKey, setSelectedPageKey] = useState<string | null>(null);
	const [isBootstrapping, setIsBootstrapping] = useState(true);
	const [isLoadingDetails, setIsLoadingDetails] = useState(false);
	const [isSubmittingRun, setIsSubmittingRun] = useState(false);
	const [capturingAuthHost, setCapturingAuthHost] = useState<string | null>(null);
	const [isGeneratingLlmReport, setIsGeneratingLlmReport] = useState(false);
	const [isDeletingRun, setIsDeletingRun] = useState(false);
	const [savingAssetKey, setSavingAssetKey] = useState<string | null>(null);
	const [llmReport, setLlmReport] = useState<ApiLlmReport | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [draftProfileName, setDraftProfileName] = useState('Blank page native');
	const [draftProfileUrl, setDraftProfileUrl] = useState('https://russeltest.bitrix24.ru/blank.php');
	const [draftProfilePages, setDraftProfilePages] = useState('https://russeltest.bitrix24.ru/blank.php');
	const [draftThrottling, setDraftThrottling] = useState('native');
	const [draftCacheMode, setDraftCacheMode] = useState<'cold' | 'warm' | 'both'>('cold');
	const [draftEnvironment, setDraftEnvironment] = useState<ApiEnvironment>('production');
	const [copyFeedback, setCopyFeedback] = useState(false);

	useEffect(() => {
		let isCancelled = false;

		async function loadBootstrap(): Promise<void>
		{
			try
			{
				setIsBootstrapping(true);
				setErrorMessage(null);

				const [loadedProfiles, loadedRuns, loadedAuthSessions, loadedAssetIssues, loadedAppConfig] = await Promise.all([
					fetchProfiles(),
					fetchRuns(),
					fetchAuthSessions(),
					fetchAssetIssues(),
					fetchAppConfig().catch(() => ({ vncUrl: null } as ApiAppConfig)),
				]);

				if (isCancelled)
				{
					return;
				}

				setProfiles(loadedProfiles);
				setRuns(loadedRuns);
				setAuthSessions(loadedAuthSessions);
				setAssetIssues(loadedAssetIssues);
				setAppConfig(loadedAppConfig);
				setSelectedRunId((currentSelectedRunId) => currentSelectedRunId ?? pickDefaultRunId(loadedRuns));
			}
			catch
			{
				if (!isCancelled)
				{
					setErrorMessage('Не удалось загрузить данные pageperf-runner.');
				}
			}
			finally
			{
				if (!isCancelled)
				{
					setIsBootstrapping(false);
				}
			}
		}

		void loadBootstrap();

		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!selectedRunId)
		{
			setSelectedRunDetails(null);

			return;
		}

		let isCancelled = false;

		async function loadDetails(): Promise<void>
		{
			try
			{
				setIsLoadingDetails(true);
				setErrorMessage(null);

				const details = await fetchRunDetails(selectedRunId);

				if (!isCancelled)
				{
					setSelectedRunDetails(details);
				}
			}
			catch (error)
			{
				if (!isCancelled)
				{
					setErrorMessage(toErrorMessage(error));
				}
			}
			finally
			{
				if (!isCancelled)
				{
					setIsLoadingDetails(false);
				}
			}
		}

		void loadDetails();

		return () => {
			isCancelled = true;
		};
	}, [selectedRunId]);

	useEffect(() => {
		const passLabels = (selectedRunDetails?.passes ?? []).map((pass) => pass.label);

		if (passLabels.length === 0)
		{
			setSelectedPassLabel(null);

			return;
		}

		setSelectedPassLabel((currentPassLabel) => (
			currentPassLabel && passLabels.includes(currentPassLabel)
				? currentPassLabel
				: passLabels[0]
		));
	}, [selectedRunDetails]);

	useEffect(() => {
		setLlmReport(null);
	}, [selectedRunId, selectedPassLabel, selectedPageKey]);

	useEffect(() => {
		const host = hostFromUrl(draftProfileUrl);

		if (host === lastAutoAuthHostRef.current) {
			return;
		}

		lastAutoAuthHostRef.current = host;

		const hasReadySession = host
			? authSessions.some((session) => session.host === host && session.status === 'ready')
			: false;

		setUseAuthSession(hasReadySession);
	}, [draftProfileUrl, authSessions]);

	useEffect(() => {
		const selectedRun = runs.find((run) => run.id === selectedRunId);
		if (!selectedRun || (selectedRun.status !== 'running' && selectedRun.status !== 'queued')) {
			return;
		}

		const intervalId = setInterval(() => {
			void (async () => {
				try {
					const [updatedRuns, updatedDetails] = await Promise.all([
						fetchRuns(),
						selectedRunId ? fetchRunDetails(selectedRunId) : Promise.resolve(null),
					]);
					setRuns(updatedRuns);
					if (updatedDetails) {
						setSelectedRunDetails(updatedDetails);
					}
				} catch {
					// Silently ignore polling errors
				}
			})();
		}, 3000);

		return () => clearInterval(intervalId);
	}, [selectedRunId, runs]);

	const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
	const runItems: RunListItem[] = runs.map((run) => {
		const profile = profilesById.get(run.profileId);

		return {
			id: run.id,
			page: profile ? getPageLabel(profile.url) : run.profileId,
			profile: profile?.name ?? run.profileId,
			status: run.status,
			context: profile ? `${profile.throttling} / ${profile.cacheMode}` : 'native / cold',
			createdAt: run.createdAt,
		};
	});

	const selectedProfile = selectedRunDetails
		? profilesById.get(selectedRunDetails.run.profileId) ?? null
		: null;
	const availablePages = getRunPageOptions(selectedRunDetails, selectedProfile?.url ?? null);

	useEffect(() => {
		if (availablePages.length === 0)
		{
			setSelectedPageKey(null);

			return;
		}

		setSelectedPageKey((currentPageKey) => (
			currentPageKey && availablePages.some((page) => page.pageKey === currentPageKey)
				? currentPageKey
				: availablePages[0].pageKey
		));
	}, [selectedRunDetails, selectedProfile?.url]);

	const activePage = availablePages.find((page) => page.pageKey === selectedPageKey)
		?? availablePages[0]
		?? null;
	const fallbackPass: RunPass | null = selectedRunDetails
		? {
			label: 'cold',
			pageMetrics: activePage?.pageMetrics ?? selectedRunDetails.pageMetrics,
			requests: activePage?.requests ?? selectedRunDetails.requests,
			traceSummary: activePage?.traceSummary ?? selectedRunDetails.traceSummary,
			jsExecutionSummary: activePage?.jsExecutionSummary ?? selectedRunDetails.jsExecutionSummary,
			coverageSummary: activePage?.coverageSummary ?? selectedRunDetails.coverageSummary,
			pageDiagnostics: activePage?.pageDiagnostics ?? selectedRunDetails.pageDiagnostics,
		}
		: null;
	const availablePasses: RunPass[] = activePage?.passes?.length
		? activePage.passes
		: selectedRunDetails?.passes?.length
			? selectedRunDetails.passes
		: fallbackPass
			? [fallbackPass]
			: [];
	const activePass = availablePasses.find((pass) => pass.label === selectedPassLabel)
		?? availablePasses[0]
		?? null;
	const metricMap = getMetricMap(activePass?.pageMetrics ?? []);
	const selectedRequests = activePass?.requests ?? [];
	const activeTraceSummary = activePass?.traceSummary ?? activePage?.traceSummary ?? selectedRunDetails?.traceSummary;
	const activeJsExecutionSummary = activePass?.jsExecutionSummary ?? activePage?.jsExecutionSummary ?? selectedRunDetails?.jsExecutionSummary;
	const activeCoverageSummary = activePass?.coverageSummary ?? activePage?.coverageSummary ?? selectedRunDetails?.coverageSummary;
	const activeDiagnostics = activePass?.pageDiagnostics ?? activePage?.pageDiagnostics ?? selectedRunDetails?.pageDiagnostics;
	const deepMetricItems = buildDeepMetricItems(metricMap, activeTraceSummary, activeCoverageSummary, activeDiagnostics);
	const assetIssuesByKey = new Map(assetIssues.map((issue) => [issue.assetKey, issue]));
	const totalEncodedBytes = selectedRequests.reduce((sum, request) => sum + request.encodedBodySize, 0);
	const totalDecodedBytes = selectedRequests.reduce((sum, request) => sum + request.decodedBodySize, 0);
	const summaryItems: SummaryItem[] = [
		{
			label: 'Статус',
			value: selectedRunDetails?.run.status ?? 'idle',
			tone: selectedRunDetails?.run.status === 'completed' ? 'success' : 'warning',
		},
		{
			label: 'Профиль',
			value: selectedProfile?.name ?? 'Ожидание прогона',
		},
		{
			label: 'Режим кеша',
			value: selectedProfile?.cacheMode ?? draftCacheMode,
		},
		{
			label: 'Тип прогона',
			value: activePass?.label ?? 'n/a',
		},
		{
			label: 'Страницы',
			value: formatCount(availablePages.length || (selectedProfile?.pages?.length ?? 0) || 1),
		},
		{
			label: 'Запросы',
			value: formatCount(selectedRequests.length),
		},
		{
			label: 'Сжатый размер',
			value: formatBytes(totalEncodedBytes),
		},
		{
			label: 'Исходный размер',
			value: formatBytes(totalDecodedBytes),
		},
		{
			label: 'Виды сжатия',
			value: selectedRequests.length > 0 ? getCompressionMix(selectedRequests) : 'n/a',
		},
	];
	const stageItems = buildStageItems(metricMap);
	const requestTypes = [...new Set(selectedRequests.map((request) => request.resourceType))].sort();
	const assetTypes = requestTypes;
	const requestItems = selectedRequests.map((request) => ({
		assetKey: normalizeAssetUrl(request.url),
		url: request.url,
		resourceType: request.resourceType,
		duration: request.durationMs !== undefined ? formatMetricValue('duration', request.durationMs) : 'n/a',
		durationMs: request.durationMs ?? 0,
		encoding: request.contentEncoding ?? 'none',
		transfer: formatBytes(request.transferSize),
		transferBytes: request.transferSize,
		encoded: formatBytes(request.encodedBodySize),
		encodedBytes: request.encodedBodySize,
		decoded: formatBytes(request.decodedBodySize),
		decodedBytes: request.decodedBodySize,
		startTimeMs: request.startTimeMs,
		endTimeMs: request.endTimeMs,
		queueingMs: request.queueingMs,
		dnsMs: request.dnsMs,
		connectMs: request.connectMs,
		sslMs: request.sslMs,
		requestSentMs: request.requestSentMs,
		waitingMs: request.waitingMs,
		downloadMs: request.downloadMs,
		initiatorType: request.initiatorType,
		initiatorUrl: request.initiatorUrl,
		redirectParentUrl: request.redirectParentUrl,
		protocol: request.protocol,
		priority: request.priority,
		issue: assetIssuesByKey.get(normalizeAssetUrl(request.url)),
	}));
	const filteredRequests = requestType === 'all'
		? requestItems
		: requestItems.filter((request) => request.resourceType === requestType);
	const heavyAssetThresholdBytes = Math.max(0, Number(heavyAssetThresholdMb) || 0) * 1024 * 1024;
	const assets: AssetRow[] = selectedRequests.map((request) => ({
			assetKey: normalizeAssetUrl(request.url),
			url: request.url,
			resourceType: request.resourceType,
			duration: request.durationMs !== undefined ? formatMetricValue('duration', request.durationMs) : 'n/a',
			durationMs: request.durationMs ?? 0,
			encoded: formatBytes(request.encodedBodySize),
			encodedBytes: request.encodedBodySize,
			decoded: formatBytes(request.decodedBodySize),
			decodedBytes: request.decodedBodySize,
			compression: request.contentEncoding ?? 'none',
			expansion: request.encodedBodySize > 0
				? formatRatio(request.decodedBodySize / request.encodedBodySize)
				: 'n/a',
			expansionRatio: request.encodedBodySize > 0
				? request.decodedBodySize / request.encodedBodySize
				: null,
			isHeavy: request.decodedBodySize > heavyAssetThresholdBytes && heavyAssetThresholdBytes > 0,
			issue: assetIssuesByKey.get(normalizeAssetUrl(request.url)),
		}));
	const filteredAssets = assetType === 'all'
		? assets
		: assets.filter((asset) => asset.resourceType === assetType);
	const heavyAssetCount = assets.filter((asset) => asset.isHeavy).length;

	async function handleCreateAndStartRun(): Promise<void>
	{
		const profilePages = normalizePagesForSubmit(draftProfilePages, draftProfileUrl);

		try
		{
			setIsSubmittingRun(true);
			setErrorMessage(null);

			const profile = await createProfile({
				name: draftProfileName,
				url: draftProfileUrl,
				pages: profilePages.length > 0 ? profilePages : [draftProfileUrl],
				throttling: draftThrottling,
				authMode: useAuthSession ? 'session' : 'none',
				cacheMode: draftCacheMode,
				environment: draftEnvironment,
				isTemplate: saveAsTemplate,
			});
			const run = await createRun(profile.id);
			const startedRun = await startRun(run.id);

			setProfiles((currentProfiles) => [profile, ...currentProfiles]);
			setRuns((currentRuns) => [
				startedRun.run,
				...currentRuns.filter((currentRun) => currentRun.id !== startedRun.run.id),
			]);
			setSelectedRunId(startedRun.run.id);
			setSelectedRunDetails(startedRun);
			setAssetIssues(await fetchAssetIssues());
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
		}
		finally
		{
			setIsSubmittingRun(false);
		}
	}

	async function handleStartExistingProfile(profileId: string): Promise<void>
	{
		try
		{
			setIsSubmittingRun(true);
			setErrorMessage(null);

			const run = await createRun(profileId);
			const startedRun = await startRun(run.id);

			setRuns((currentRuns) => [
				startedRun.run,
				...currentRuns.filter((currentRun) => currentRun.id !== startedRun.run.id),
			]);
			setSelectedRunId(startedRun.run.id);
			setSelectedRunDetails(startedRun);
			setAssetIssues(await fetchAssetIssues());
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
		}
		finally
		{
			setIsSubmittingRun(false);
		}
	}

	async function handlePromoteProfileToTemplate(profileId: string): Promise<void>
	{
		try
		{
			setIsPromotingTemplate(true);
			setErrorMessage(null);

			const updated = await setProfileTemplate(profileId, true);

			setProfiles((currentProfiles) => currentProfiles.map((profile) => (
				profile.id === updated.id ? updated : profile
			)));
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
		}
		finally
		{
			setIsPromotingTemplate(false);
		}
	}

	async function handleCaptureAuth(targetUrl: string): Promise<void>
	{
		const trimmed = targetUrl.trim();
		if (!trimmed)
		{
			return;
		}

		const host = hostFromUrl(trimmed);

		try
		{
			setCapturingAuthHost(host);
			setErrorMessage(null);

			await captureAuthSession(trimmed);

			const nextSessions = await fetchAuthSessions();
			setAuthSessions(nextSessions);

			const draftHost = hostFromUrl(draftProfileUrl);
			if (host && draftHost && host === draftHost)
			{
				const nextForDraft = nextSessions.find((session) => session.host === draftHost);
				if (nextForDraft?.status === 'ready')
				{
					setUseAuthSession(true);
				}
			}
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
		}
		finally
		{
			setCapturingAuthHost(null);
		}
	}

	async function handleDeleteAuth(host: string): Promise<void>
	{
		try
		{
			setErrorMessage(null);
			await deleteAuthSession(host);
			const nextSessions = await fetchAuthSessions();
			setAuthSessions(nextSessions);

			const draftHost = hostFromUrl(draftProfileUrl);
			if (draftHost && draftHost === host)
			{
				setUseAuthSession(false);
			}
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
		}
	}

	async function handleSaveAssetIssue(input: {
		assetKey?: string;
		assetUrl: string;
		resourceType: string;
		mantisUrl: string;
		status: 'open' | 'review' | 'closed';
		note: string;
	}): Promise<void>
	{
		const effectiveAssetKey = input.assetKey ?? normalizeAssetUrl(input.assetUrl);

		try
		{
			setSavingAssetKey(effectiveAssetKey);
			setErrorMessage(null);

			const nextIssue = input.assetKey
				? await updateAssetIssue({
					assetKey: input.assetKey,
					resourceType: input.resourceType,
					mantisUrl: input.mantisUrl,
					status: input.status,
					note: input.note,
				})
				: await createAssetIssue({
					assetUrl: input.assetUrl,
					resourceType: input.resourceType,
					mantisUrl: input.mantisUrl,
					status: input.status,
					note: input.note,
				});

			setAssetIssues((currentIssues) => [
				nextIssue,
				...currentIssues.filter((issue) => issue.assetKey !== nextIssue.assetKey),
			]);
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
			throw error;
		}
		finally
		{
			setSavingAssetKey(null);
		}
	}

	async function handleDeleteAssetIssue(assetKey: string): Promise<void>
	{
		try
		{
			setSavingAssetKey(assetKey);
			setErrorMessage(null);

			await deleteAssetIssue(assetKey);
			setAssetIssues((currentIssues) => currentIssues.filter((issue) => issue.assetKey !== assetKey));
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
			throw error;
		}
		finally
		{
			setSavingAssetKey(null);
		}
	}

	async function handleGenerateLlmReport(): Promise<void>
	{
		if (!selectedRunId)
		{
			return;
		}

		try
		{
			setIsGeneratingLlmReport(true);
			setErrorMessage(null);

			const report = await fetchLlmReport(
				selectedRunId,
				activePass?.label ?? null,
				availablePages.length > 1 ? activePage?.pageKey ?? null : null,
			);

			setLlmReport(report);
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
		}
		finally
		{
			setIsGeneratingLlmReport(false);
		}
	}

	async function handleDeleteRun(): Promise<void>
	{
		if (!selectedRunId)
		{
			return;
		}

		try
		{
			setIsDeletingRun(true);
			setErrorMessage(null);

			await deleteRun(selectedRunId);

			const remainingRuns = runs.filter((run) => run.id !== selectedRunId);

			setRuns(remainingRuns);
			setSelectedRunDetails(null);
			setSelectedPageKey(null);
			setSelectedRunId(pickDefaultRunId(remainingRuns));
			setLlmReport(null);
		}
		catch (error)
		{
			setErrorMessage(toErrorMessage(error));
		}
		finally
		{
			setIsDeletingRun(false);
		}
	}

	async function handleCopyLlmReport(): Promise<void>
	{
		if (!llmReport || typeof navigator === 'undefined' || !navigator.clipboard?.writeText)
		{
			return;
		}

		await navigator.clipboard.writeText(llmReport.content);
		setCopyFeedback(true);
		setTimeout(() => setCopyFeedback(false), 2000);
	}

	return (
		<main className="app-shell">
			<aside className="sidebar">
				<div className="brand-block">
					<p className="eyebrow">Bitrix Frontend Diagnostics</p>
					<h1>pageperf-runner</h1>
					<p className="brand-copy">Диагностика загрузки страниц, сетевых запросов и JS-бандлов портала Bitrix.</p>
				</div>

				<RunTemplatesList
					profiles={profiles}
					isSubmitting={isSubmittingRun}
					onStartExisting={(profileId) => {
						void handleStartExistingProfile(profileId);
					}}
					onProfileUpdated={(updated) => {
						setProfiles((current) => current.map((profile) => profile.id === updated.id ? updated : profile));
					}}
				/>

				<RunLaunchForm
					name={draftProfileName}
					url={draftProfileUrl}
					pages={draftProfilePages}
					throttling={draftThrottling}
					cacheMode={draftCacheMode}
					environment={draftEnvironment}
					useAuthSession={useAuthSession}
					saveAsTemplate={saveAsTemplate}
					isSubmitting={isSubmittingRun}
					onNameChange={setDraftProfileName}
					onUrlChange={setDraftProfileUrl}
					onPagesChange={setDraftProfilePages}
					onThrottlingChange={setDraftThrottling}
					onCacheModeChange={setDraftCacheMode}
					onEnvironmentChange={setDraftEnvironment}
					onUseAuthSessionChange={setUseAuthSession}
					onSaveAsTemplateChange={setSaveAsTemplate}
					onSubmit={() => {
						void handleCreateAndStartRun();
					}}
				/>

				<AuthSessionsList
					sessions={authSessions}
					capturingHost={capturingAuthHost}
					vncUrl={appConfig.vncUrl}
					onCapture={(targetUrl) => {
						void handleCaptureAuth(targetUrl);
					}}
					onRecapture={(host, targetUrl) => {
						void handleCaptureAuth(targetUrl ?? `https://${host}/`);
					}}
					onDelete={(host) => {
						void handleDeleteAuth(host);
					}}
				/>

				<RunList
					runs={runItems}
					selectedRunId={selectedRunId}
					onRunSelect={setSelectedRunId}
				/>
			</aside>

			<section className="workspace">
				<header className="workspace-header">
					<div>
						<p className="eyebrow">Текущий прогон</p>
						<h2>{selectedProfile?.name ?? 'Выберите прогон'}</h2>
						<p className="workspace-copy">
							{activePage?.url ?? selectedProfile?.url ?? 'Выберите прогон или создайте новый профиль слева.'}
						</p>
					</div>

					<div className="workspace-status">
						{availablePages.length > 1 ? (
							<label className="toolbar-control workspace-page-picker">
								<span>Страница прогона</span>
								<select
									aria-label="Страница прогона"
									value={selectedPageKey ?? ''}
									onChange={(event) => setSelectedPageKey(event.target.value)}
								>
									{availablePages.map((page) => (
										<option key={page.pageKey} value={page.pageKey}>
											{getPageLabel(page.url)}
										</option>
									))}
								</select>
							</label>
						) : null}
						{selectedRunId ? (
							<button
								type="button"
								className="secondary-button secondary-button-compact"
								onClick={() => {
									void handleGenerateLlmReport();
								}}
								disabled={isGeneratingLlmReport}
							>
								{isGeneratingLlmReport ? 'Готовлю LLM-отчёт…' : 'Сформировать LLM-отчёт'}
							</button>
						) : null}
						{selectedProfile && !selectedProfile.isTemplate ? (
							<button
								type="button"
								className="secondary-button secondary-button-compact"
								onClick={() => {
									void handlePromoteProfileToTemplate(selectedProfile.id);
								}}
								disabled={isPromotingTemplate}
							>
								{isPromotingTemplate ? 'Сохраняю…' : 'Сохранить как шаблон'}
							</button>
						) : null}
						{selectedRunId ? (
							<button
								type="button"
								className="secondary-button secondary-button-danger secondary-button-compact"
								onClick={() => {
									void handleDeleteRun();
								}}
								disabled={isDeletingRun}
							>
								{isDeletingRun ? 'Удаляю…' : 'Удалить прогон'}
							</button>
						) : null}
						<span className={`status-pill status-${selectedRunDetails?.run.status ?? 'idle'}`}>
							{getStatusDisplayLabel(selectedRunDetails?.run.status ?? 'idle')}
						</span>
						<span className="workspace-context">{selectedProfile?.throttling ?? draftThrottling}</span>
					</div>
				</header>

				{errorMessage ? <p className="message-banner message-banner-error">{errorMessage}</p> : null}
				{isBootstrapping ? <p className="message-banner">Загрузка прогонов…</p> : null}
				{selectedRunId && isLoadingDetails ? <p className="message-banner">Загрузка данных прогона…</p> : null}

				<div className="resource-tabs workspace-tabs" role="tablist" aria-label="Workspace tabs">
					{([
						['assets', 'Ресурсы', filteredAssets.length],
						['requests', 'Запросы', filteredRequests.length],
						['overview', 'Обзор', null],
						['analysis', 'Анализ', null],
						['mantis', 'Mantis-трекер', assetIssues.length],
					] as const).map(([tab, label, count]) => (
						<button
							key={tab}
							type="button"
							role="tab"
							aria-selected={workspaceTab === tab}
							className={`resource-tab ${workspaceTab === tab ? 'is-active' : ''}`}
							onClick={() => setWorkspaceTab(tab)}
						>
							{label}{count !== null ? <> <span className="tab-count">({count})</span></> : null}
						</button>
					))}
				</div>

				{workspaceTab === 'requests' ? (
					<RequestTable
						requestType={requestType}
						requestTypes={requestTypes}
						requests={filteredRequests}
						isSavingAssetKey={savingAssetKey}
						targetUrl={activePage?.url ?? selectedProfile?.url}
						onRequestTypeChange={setRequestType}
						onSaveIssue={handleSaveAssetIssue}
						onDeleteIssue={handleDeleteAssetIssue}
					/>
				) : null}

				{workspaceTab === 'overview' ? (
					<>
						<RunOverview
							summaryItems={summaryItems}
							stageItems={stageItems}
							deepMetricItems={deepMetricItems}
							passLabels={availablePasses.map((pass) => pass.label)}
							selectedPassLabel={activePass?.label ?? null}
							onPassSelect={setSelectedPassLabel}
						/>

						{llmReport ? (
							<section className="panel panel-llm-report" aria-labelledby="llm-report-heading">
								<div className="panel-heading panel-heading-inline">
									<div>
										<p className="eyebrow">Экспорт для AI</p>
										<h2 id="llm-report-heading">LLM Report</h2>
									</div>
									<div className="workspace-status">
										<span className="workspace-context">{llmReport.passLabel}</span>
										<button type="button" className="secondary-button secondary-button-compact" onClick={() => { void handleCopyLlmReport(); }}>
											{copyFeedback ? 'Скопировано!' : 'Копировать'}
										</button>
									</div>
								</div>
								<textarea className="llm-report-textarea" aria-label="LLM Report Content" readOnly value={llmReport.content} />
							</section>
						) : null}
					</>
				) : null}

				{workspaceTab === 'analysis' ? (
					<>
						<JsExecutionPanel
							summary={activeJsExecutionSummary}
							targetUrl={activePage?.url ?? selectedProfile?.url}
						/>

						<OversizedImagesPanel
							images={activeDiagnostics?.oversizedImages}
							targetUrl={activePage?.url ?? selectedProfile?.url}
						/>

						<ThirdPartyPanel
							summary={activeDiagnostics?.thirdParty}
						/>

						<LongTasksPanel
							longTasks={activeTraceSummary?.longTasks}
							targetUrl={activePage?.url ?? selectedProfile?.url}
						/>

						<RenderBlockingPanel
							resources={activeDiagnostics?.renderBlocking}
							targetUrl={activePage?.url ?? selectedProfile?.url}
						/>
					</>
				) : null}

				{workspaceTab === 'assets' ? (
					<AssetTable
						assetType={assetType}
						assetTypes={assetTypes}
						assets={filteredAssets}
						heavyAssetCount={heavyAssetCount}
						heavyAssetThresholdMb={heavyAssetThresholdMb}
						isSavingAssetKey={savingAssetKey}
						targetUrl={activePage?.url ?? selectedProfile?.url}
						onAssetTypeChange={setAssetType}
						onHeavyAssetThresholdMbChange={setHeavyAssetThresholdMb}
						onSaveIssue={handleSaveAssetIssue}
						onDeleteIssue={handleDeleteAssetIssue}
					/>
				) : null}

				{workspaceTab === 'mantis' ? (
					<IssueWatch
						issues={assetIssues}
						isSavingAssetKey={savingAssetKey}
						onSaveIssue={handleSaveAssetIssue}
						onDeleteIssue={handleDeleteAssetIssue}
					/>
				) : null}
		</section>
		</main>
	);
}
