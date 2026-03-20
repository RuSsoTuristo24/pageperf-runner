import { useEffect, useState } from 'react';

import { fetchRunDetails, type ApiRun, type ApiRunDetails } from '../../lib/api.js';
import { formatBytes, formatMetricValue } from '../../lib/format.js';
import { getResourceLabel } from '../../lib/url.js';

type RunCompareProps = {
	currentRun: ApiRunDetails;
	runs: ApiRun[];
	currentRunId: string;
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

export function RunCompare({ currentRun, runs, currentRunId }: RunCompareProps)
{
	const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
	const [baselineDetails, setBaselineDetails] = useState<ApiRunDetails | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const otherRuns = runs.filter((r) => r.id !== currentRunId && r.status === 'completed');

	useEffect(() => {
		if (!baselineRunId)
		{
			setBaselineDetails(null);

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

	// Metric diffs
	const metricDiffs: MetricDiff[] = [];

	if (baselineDetails)
	{
		const currentMetrics = new Map(currentRun.pageMetrics.map((m) => [m.name, m.value]));
		const baselineMetrics = new Map(baselineDetails.pageMetrics.map((m) => [m.name, m.value]));

		for (const name of ['ttfb', 'fcp', 'lcp', 'dcl', 'load'])
		{
			const current = currentMetrics.get(name);
			const baseline = baselineMetrics.get(name);

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

	if (baselineDetails)
	{
		const currentByUrl = new Map(
			currentRun.requests.map((r) => [normalizeUrl(r.url), r.decodedBodySize]),
		);
		const baselineByUrl = new Map(
			baselineDetails.requests.map((r) => [normalizeUrl(r.url), r.decodedBodySize]),
		);

		for (const [url, currentBytes] of currentByUrl)
		{
			const baselineBytes = baselineByUrl.get(url);

			if (baselineBytes === undefined)
			{
				newAssets.push({
					url,
					label: getResourceLabel(url),
					currentBytes,
					baselineBytes: 0,
					delta: currentBytes,
				});
			}
			else if (Math.abs(currentBytes - baselineBytes) > 100)
			{
				changedAssets.push({
					url,
					label: getResourceLabel(url),
					currentBytes,
					baselineBytes,
					delta: currentBytes - baselineBytes,
				});
			}
		}

		for (const [url, baselineBytes] of baselineByUrl)
		{
			if (!currentByUrl.has(url))
			{
				removedAssets.push({
					url,
					label: getResourceLabel(url),
					currentBytes: 0,
					baselineBytes,
					delta: -baselineBytes,
				});
			}
		}

		newAssets.sort((a, b) => b.delta - a.delta);
		removedAssets.sort((a, b) => a.delta - b.delta);
		changedAssets.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
	}

	// Size totals
	const currentTotal = currentRun.requests.reduce((s, r) => s + r.decodedBodySize, 0);
	const baselineTotal = baselineDetails
		? baselineDetails.requests.reduce((s, r) => s + r.decodedBodySize, 0)
		: 0;

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
									{run.id.slice(0, 8)} — {run.createdAt ? new Date(run.createdAt).toLocaleString('ru') : '?'}
								</option>
							))}
						</select>
					</label>
				</div>
			</div>

			{!baselineRunId ? (
				<p className="compare-prompt">Выберите baseline-прогон для сравнения с текущим.</p>
			) : null}

			{isLoading ? (
				<p className="compare-prompt">Загрузка baseline...</p>
			) : null}

			{baselineDetails ? (
				<div className="compare-content">
					<div className="compare-section">
						<h3 className="compare-section-title">Метрики</h3>
						<div className="compare-metrics">
							{metricDiffs.map((m) => (
								<div key={m.name} className={`compare-metric ${deltaClass(m.deltaPercent)}`}>
									<span className="compare-metric-name">{m.name}</span>
									<span className="compare-metric-values">
										{formatMetricValue('duration', m.baseline)} → {formatMetricValue('duration', m.current)}
									</span>
									<span className="compare-metric-delta">
										{formatDelta(m.delta, 'ms')} ({m.deltaPercent > 0 ? '+' : ''}{m.deltaPercent.toFixed(0)}%)
									</span>
								</div>
							))}
							<div className={`compare-metric ${deltaClass(baselineTotal > 0 ? ((currentTotal - baselineTotal) / baselineTotal) * 100 : 0)}`}>
								<span className="compare-metric-name">Total Size</span>
								<span className="compare-metric-values">
									{formatBytes(baselineTotal)} → {formatBytes(currentTotal)}
								</span>
								<span className="compare-metric-delta">
									{formatDelta(currentTotal - baselineTotal, 'bytes')}
								</span>
							</div>
							<div className="compare-metric diff-neutral">
								<span className="compare-metric-name">Requests</span>
								<span className="compare-metric-values">
									{baselineDetails.requests.length} → {currentRun.requests.length}
								</span>
								<span className="compare-metric-delta">
									{currentRun.requests.length - baselineDetails.requests.length > 0 ? '+' : ''}
									{currentRun.requests.length - baselineDetails.requests.length}
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
						<p className="compare-prompt">Набор ассетов идентичен.</p>
					) : null}
				</div>
			) : null}
		</section>
	);
}
