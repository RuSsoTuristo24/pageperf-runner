import { useEffect, useState } from 'react';

import { fetchRunDetails, type ApiProfile, type ApiRun, type ApiRunDetails } from '../../lib/api.js';
import { formatBytes, formatMetricValue } from '../../lib/format.js';
import { getResourceLabel } from '../../lib/url.js';

type RunCompareProps = {
	/** Current active page metrics */
	currentMetrics: Array<{ name: string; value: number }>;
	/** Current active page/pass requests */
	currentRequests: ApiRunDetails['requests'];
	/** Current run info */
	currentRunId: string;
	currentUrl?: string;
	/** All runs and profiles for the baseline selector */
	runs: ApiRun[];
	profiles: ApiProfile[];
};

type MetricDiff = {
	name: string;
	current: number;
	baseline: number;
	delta: number;
	deltaPercent: number;
};

type AssetDiff = {
	url: string;
	label: string;
	currentBytes: number;
	baselineBytes: number;
	delta: number;
};

function formatDelta(delta: number, unit: 'ms' | 'bytes'): string
{
	const sign = delta > 0 ? '+' : '';

	if (unit === 'bytes')
	{
		return sign + formatBytes(delta);
	}

	return sign + formatMetricValue('duration', delta);
}

function deltaClass(deltaPercent: number): string
{
	if (deltaPercent > 5)
	{
		return 'diff-worse';
	}

	if (deltaPercent < -5)
	{
		return 'diff-better';
	}

	return 'diff-neutral';
}

function normalizeUrl(url: string): string
{
	return url.split('?')[0];
}

function getPageLabel(url: string): string
{
	try
	{
		return new URL(url).pathname;
	}
	catch
	{
		return url;
	}
}

function getRunLabel(run: ApiRun, profiles: ApiProfile[]): string
{
	const profile = profiles.find((p) => p.id === run.profileId);
	const name = profile?.name ?? 'Unknown';
	const date = run.createdAt
		? new Date(run.createdAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
		: '?';

	return `${name} — ${date}`;
}

export function RunCompare({ currentMetrics, currentRequests, currentRunId, currentUrl, runs, profiles }: RunCompareProps)
{
	const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
	const [baselineDetails, setBaselineDetails] = useState<ApiRunDetails | null>(null);
	const [baselinePageKey, setBaselinePageKey] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const otherRuns = runs.filter((r) => r.id !== currentRunId && r.status === 'completed');

	useEffect(() => {
		if (!baselineRunId)
		{
			setBaselineDetails(null);
			setBaselinePageKey(null);

			return;
		}

		let cancelled = false;

		async function load(): Promise<void>
		{
			try
			{
				setIsLoading(true);

				const details = await fetchRunDetails(baselineRunId!);

				if (!cancelled)
				{
					setBaselineDetails(details);

					// Auto-select matching page if baseline is multi-page
					if (details.pages?.length && currentUrl)
					{
						const match = details.pages.find((p) => getPageLabel(p.url) === getPageLabel(currentUrl));
						setBaselinePageKey(match?.pageKey ?? details.pages[0].pageKey);
					}
					else
					{
						setBaselinePageKey(null);
					}
				}
			}
			catch
			{
				if (!cancelled)
				{
					setBaselineDetails(null);
				}
			}
			finally
			{
				if (!cancelled)
				{
					setIsLoading(false);
				}
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [baselineRunId]);

	// Resolve baseline metrics and requests for the selected page
	let baselineMetrics: Array<{ name: string; value: number }> = [];
	let baselineRequests: ApiRunDetails['requests'] = [];
	let baselineUrl = '';

	if (baselineDetails)
	{
		if (baselineDetails.pages?.length && baselinePageKey)
		{
			const page = baselineDetails.pages.find((p) => p.pageKey === baselinePageKey);

			if (page)
			{
				baselineMetrics = page.pageMetrics;
				baselineRequests = page.requests;
				baselineUrl = page.url;
			}
		}
		else
		{
			baselineMetrics = baselineDetails.pageMetrics;
			baselineRequests = baselineDetails.requests;

			const baselineProfile = profiles.find((p) => p.id === baselineDetails!.run.profileId);
			baselineUrl = baselineProfile?.url ?? '';
		}
	}

	// Metric diffs
	const METRIC_HINTS: Record<string, string> = {
		TTFB: 'Time to First Byte. Время от начала навигации до получения первого байта ответа от сервера. Показывает скорость серверной обработки + сетевую задержку.',
		FCP: 'First Contentful Paint. Когда браузер отрисовал первый текст, изображение или canvas. Момент, когда пользователь видит что страница начала загружаться.',
		LCP: 'Largest Contentful Paint. Когда отрисовался крупнейший видимый элемент (заголовок, картинка). Ключевая метрика Core Web Vitals — должна быть < 2.5с.',
		DCL: 'DOMContentLoaded. HTML полностью разобран, все синхронные скрипты выполнены. Картинки и async-скрипты могут ещё грузиться.',
		LOAD: 'Load. Все ресурсы страницы загружены (картинки, шрифты, CSS, JS). Полная загрузка страницы.',
	};

	const metricDiffs: MetricDiff[] = [];

	if (baselineMetrics.length > 0)
	{
		const currentMap = new Map(currentMetrics.map((m) => [m.name, m.value]));
		const baselineMap = new Map(baselineMetrics.map((m) => [m.name, m.value]));

		for (const name of ['ttfb', 'fcp', 'lcp', 'dcl', 'load'])
		{
			const current = currentMap.get(name);
			const baseline = baselineMap.get(name);

			if (current !== undefined && baseline !== undefined)
			{
				const delta = current - baseline;

				metricDiffs.push({
					name: name.toUpperCase(),
					current,
					baseline,
					delta,
					deltaPercent: baseline > 0 ? (delta / baseline) * 100 : 0,
				});
			}
		}
	}

	// Asset diffs
	let newAssets: AssetDiff[] = [];
	let removedAssets: AssetDiff[] = [];
	let changedAssets: AssetDiff[] = [];

	if (baselineRequests.length > 0)
	{
		const currentByUrl = new Map(
			currentRequests.map((r) => [normalizeUrl(r.url), r.decodedBodySize]),
		);
		const baselineByUrl = new Map(
			baselineRequests.map((r) => [normalizeUrl(r.url), r.decodedBodySize]),
		);

		for (const [url, currentBytes] of currentByUrl)
		{
			const baselineBytes = baselineByUrl.get(url);

			if (baselineBytes === undefined)
			{
				newAssets.push({ url, label: getResourceLabel(url), currentBytes, baselineBytes: 0, delta: currentBytes });
			}
			else if (Math.abs(currentBytes - baselineBytes) > 100)
			{
				changedAssets.push({ url, label: getResourceLabel(url), currentBytes, baselineBytes, delta: currentBytes - baselineBytes });
			}
		}

		for (const [url, baselineBytes] of baselineByUrl)
		{
			if (!currentByUrl.has(url))
			{
				removedAssets.push({ url, label: getResourceLabel(url), currentBytes: 0, baselineBytes, delta: -baselineBytes });
			}
		}

		newAssets.sort((a, b) => b.delta - a.delta);
		removedAssets.sort((a, b) => a.delta - b.delta);
		changedAssets.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
	}

	const currentTotal = currentRequests.reduce((s, r) => s + r.decodedBodySize, 0);
	const baselineTotal = baselineRequests.reduce((s, r) => s + r.decodedBodySize, 0);

	return (
		<section className="panel panel-compare" aria-labelledby="compare-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Сравнение</p>
					<h2 id="compare-heading">Diff прогонов</h2>
				</div>
				<div className="toolbar-group">
					<label className="toolbar-control">
						<span>Baseline</span>
						<select
							aria-label="Baseline прогон для сравнения"
							value={baselineRunId ?? ''}
							onChange={(e) => setBaselineRunId(e.target.value || null)}
						>
							<option value="">Выберите прогон</option>
							{otherRuns.map((run) => (
								<option key={run.id} value={run.id}>
									{getRunLabel(run, profiles)}
								</option>
							))}
						</select>
					</label>
					{baselineDetails?.pages?.length ? (
						<label className="toolbar-control">
							<span>Страница</span>
							<select
								aria-label="Страница baseline"
								value={baselinePageKey ?? ''}
								onChange={(e) => setBaselinePageKey(e.target.value)}
							>
								{baselineDetails.pages.map((page) => (
									<option key={page.pageKey} value={page.pageKey}>
										{getPageLabel(page.url)}
									</option>
								))}
							</select>
						</label>
					) : null}
				</div>
			</div>

			{!baselineRunId ? (
				<p className="compare-prompt">Выберите baseline-прогон для сравнения с текущим.</p>
			) : null}

			{isLoading ? (
				<p className="compare-prompt">Загрузка baseline...</p>
			) : null}

			{baselineDetails && baselineUrl && currentUrl && getPageLabel(baselineUrl) !== getPageLabel(currentUrl) ? (
				<p className="compare-warning">
					Разные страницы: текущая <strong>{getPageLabel(currentUrl)}</strong>, baseline <strong>{getPageLabel(baselineUrl)}</strong>. Сравнение может быть неинформативным.
				</p>
			) : null}

			{baselineDetails && baselineMetrics.length > 0 ? (
				<div className="compare-content">
					<div className="compare-section">
						<h3 className="compare-section-title">Метрики</h3>
						<div className="compare-metrics">
							{metricDiffs.map((m) => (
								<div key={m.name} className={`compare-metric ${deltaClass(m.deltaPercent)}`} title={METRIC_HINTS[m.name] ?? ''}>
									<span className="compare-metric-name">{m.name}</span>
									<span className="compare-metric-values">
										{formatMetricValue('duration', m.baseline)} → {formatMetricValue('duration', m.current)}
									</span>
									<span className="compare-metric-delta">
										{formatDelta(m.delta, 'ms')} ({m.deltaPercent > 0 ? '+' : ''}{m.deltaPercent.toFixed(0)}%)
									</span>
								</div>
							))}
							<div className={`compare-metric ${deltaClass(baselineTotal > 0 ? ((currentTotal - baselineTotal) / baselineTotal) * 100 : 0)}`} title="Суммарный decoded-размер всех ресурсов на странице (без сжатия).">
								<span className="compare-metric-name">Total Size</span>
								<span className="compare-metric-values">
									{formatBytes(baselineTotal)} → {formatBytes(currentTotal)}
								</span>
								<span className="compare-metric-delta">
									{formatDelta(currentTotal - baselineTotal, 'bytes')}
								</span>
							</div>
							<div className="compare-metric diff-neutral" title="Общее количество сетевых запросов на странице.">
								<span className="compare-metric-name">Requests</span>
								<span className="compare-metric-values">
									{baselineRequests.length} → {currentRequests.length}
								</span>
								<span className="compare-metric-delta">
									{currentRequests.length - baselineRequests.length > 0 ? '+' : ''}
									{currentRequests.length - baselineRequests.length}
								</span>
							</div>
						</div>
					</div>

					{newAssets.length > 0 ? (
						<div className="compare-section">
							<h3 className="compare-section-title diff-worse">Новые ассеты ({newAssets.length})</h3>
							<div className="compare-asset-list">
								{newAssets.slice(0, 20).map((a) => (
									<div key={a.url} className="compare-asset-item">
										<span className="compare-asset-name">{a.label}</span>
										<span className="compare-asset-delta diff-worse">+{formatBytes(a.delta)}</span>
									</div>
								))}
							</div>
						</div>
					) : null}

					{removedAssets.length > 0 ? (
						<div className="compare-section">
							<h3 className="compare-section-title diff-better">Удалённые ассеты ({removedAssets.length})</h3>
							<div className="compare-asset-list">
								{removedAssets.slice(0, 20).map((a) => (
									<div key={a.url} className="compare-asset-item">
										<span className="compare-asset-name">{a.label}</span>
										<span className="compare-asset-delta diff-better">{formatDelta(a.delta, 'bytes')}</span>
									</div>
								))}
							</div>
						</div>
					) : null}

					{changedAssets.length > 0 ? (
						<div className="compare-section">
							<h3 className="compare-section-title">Изменившиеся ассеты ({changedAssets.length})</h3>
							<div className="compare-asset-list">
								{changedAssets.slice(0, 20).map((a) => (
									<div key={a.url} className="compare-asset-item">
										<span className="compare-asset-name">{a.label}</span>
										<span className="compare-asset-sizes">
											{formatBytes(a.baselineBytes)} → {formatBytes(a.currentBytes)}
										</span>
										<span className={`compare-asset-delta ${a.delta > 0 ? 'diff-worse' : 'diff-better'}`}>
											{formatDelta(a.delta, 'bytes')}
										</span>
									</div>
								))}
							</div>
						</div>
					) : null}

					{newAssets.length === 0 && removedAssets.length === 0 && changedAssets.length === 0 ? (
						<p className="compare-prompt">Набор ассетов идентичен (различия менее 100 байт).</p>
					) : null}
				</div>
			) : null}
		</section>
	);
}
