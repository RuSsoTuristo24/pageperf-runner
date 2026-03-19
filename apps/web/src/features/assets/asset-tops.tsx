import { useState } from 'react';

import { fetchBatchExtStats, type ApiBatchExtStat } from '../../lib/api.js';
import { formatBytes, formatMetricValue } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel } from '../../lib/url.js';

type RequestEntry = {
	url: string;
	resourceType: string;
	decodedBodySize: number;
	durationMs?: number;
	encodedBodySize: number;
};

type JsExecEntry = {
	evalMs: number;
	confidence: 'high' | 'medium' | 'low';
};

type AssetTopsProps = {
	requests: RequestEntry[];
	jsExecByUrl: Map<string, JsExecEntry>;
	targetUrl?: string;
};

type TopItem = {
	url: string;
	label: string;
	value: string;
	sortValue: number;
};

const TOP_N = 10;

function buildTopList(items: TopItem[]): TopItem[]
{
	return [...items]
		.sort((a, b) => b.sortValue - a.sortValue)
		.slice(0, TOP_N)
		.filter((item) => item.sortValue > 0);
}

function TopSection({ title, hint, items }: { title: string; hint: string; items: TopItem[] })
{
	if (items.length === 0)
	{
		return null;
	}

	return (
		<div className="top-section">
			<h3 className="top-section-title">{title}</h3>
			<p className="top-section-hint">{hint}</p>
			<ol className="top-list">
				{items.map((item, index) => (
					<li key={item.url} className="top-item">
						<span className="top-rank">{index + 1}</span>
						<span className="top-info">
							<strong className="top-name">{item.label}</strong>
							<span className="top-url">{getDisplayUrl(item.url)}</span>
						</span>
						<span className="top-value">{item.value}</span>
					</li>
				))}
			</ol>
		</div>
	);
}

export function AssetTops({ requests, jsExecByUrl, targetUrl }: AssetTopsProps)
{
	const [depStats, setDepStats] = useState<ApiBatchExtStat[] | null>(null);
	const [isLoadingDeps, setIsLoadingDeps] = useState(false);
	const [depError, setDepError] = useState<string | null>(null);

	const targetOrigin = targetUrl ? (() => { try { return new URL(targetUrl).origin; } catch { return undefined; } })() : undefined;

	// Top: heaviest by own decoded size
	const heaviestOwn = buildTopList(
		requests.map((r) => ({
			url: r.url,
			label: getResourceLabel(r.url),
			value: formatBytes(r.decodedBodySize),
			sortValue: r.decodedBodySize,
		})),
	);

	// Top: longest eval
	const longestEval = buildTopList(
		requests
			.filter((r) => r.resourceType === 'script' && jsExecByUrl.has(r.url))
			.map((r) => {
				const exec = jsExecByUrl.get(r.url)!;

				return {
					url: r.url,
					label: getResourceLabel(r.url),
					value: `${formatMetricValue('duration', exec.evalMs)} (${exec.confidence})`,
					sortValue: exec.evalMs,
				};
			}),
	);

	// Top: worst compression (highest expansion ratio, only for sizeable assets)
	const worstCompression = buildTopList(
		requests
			.filter((r) => r.encodedBodySize > 1024 && r.decodedBodySize > r.encodedBodySize)
			.map((r) => ({
				url: r.url,
				label: getResourceLabel(r.url),
				value: `${(r.decodedBodySize / r.encodedBodySize).toFixed(1)}x (${formatBytes(r.encodedBodySize)} → ${formatBytes(r.decodedBodySize)})`,
				sortValue: r.decodedBodySize / r.encodedBodySize,
			})),
	);

	// Top: heaviest with deps (from batch stats)
	const heaviestWithDeps = depStats
		? buildTopList(
			depStats.map((s) => ({
				url: s.url,
				label: `${s.extension}`,
				value: [
					s.totalSize.js > 0 ? formatBytes(s.totalSize.js) + ' js' : '',
					s.totalSize.css > 0 ? formatBytes(s.totalSize.css) + ' css' : '',
				].filter(Boolean).join(' + '),
				sortValue: s.totalSize.js + s.totalSize.css,
			})),
		)
		: null;

	// Top: most dependencies
	const mostDeps = depStats
		? buildTopList(
			depStats.map((s) => ({
				url: s.url,
				label: `${s.extension}`,
				value: `${s.totalDeps} dep${s.totalDeps !== 1 ? 's' : ''}`,
				sortValue: s.totalDeps,
			})),
		)
		: null;

	async function handleLoadDepStats(): Promise<void>
	{
		const scriptUrls = requests
			.filter((r) => r.resourceType === 'script' || r.resourceType === 'stylesheet')
			.map((r) => {
				try
				{
					return new URL(r.url).pathname;
				}
				catch
				{
					return r.url.split('?')[0];
				}
			});

		try
		{
			setIsLoadingDeps(true);
			setDepError(null);

			const result = await fetchBatchExtStats(scriptUrls);

			setDepStats(result.results);
		}
		catch (error)
		{
			setDepError(error instanceof Error ? error.message : 'Failed to load dependency stats');
		}
		finally
		{
			setIsLoadingDeps(false);
		}
	}

	return (
		<section className="panel panel-tops" aria-labelledby="tops-heading">
			<div className="panel-heading">
				<p className="eyebrow">Аналитика</p>
				<h2 id="tops-heading">Топы ресурсов</h2>
			</div>

			<div className="tops-grid">
				<TopSection
					title="Самые тяжёлые (собственный размер)"
					hint="Decoded-размер ресурса без учёта зависимостей"
					items={heaviestOwn}
				/>

				<TopSection
					title="Самый долгий eval"
					hint="Время исполнения JS на main thread (из Chrome trace)"
					items={longestEval}
				/>

				<TopSection
					title="Худшее сжатие"
					hint="Отношение decoded/encoded — ресурсы, которые можно сжать эффективнее"
					items={worstCompression}
				/>

				<div className="tops-dep-section">
					{!depStats ? (
						<div className="tops-dep-prompt">
							<p>Топы по зависимостям требуют анализа config.php для каждого экстеншена на странице.</p>
							<button
								type="button"
								className="secondary-button"
								disabled={isLoadingDeps}
								onClick={() => { void handleLoadDepStats(); }}
							>
								{isLoadingDeps ? 'Анализирую зависимости...' : 'Загрузить топы по зависимостям'}
							</button>
							{depError ? <p className="tops-dep-error">{depError}</p> : null}
						</div>
					) : (
						<>
							<TopSection
								title="Самые тяжёлые (с зависимостями)"
								hint="Суммарный размер экстеншена + все транзитивные зависимости (.min)"
								items={heaviestWithDeps!}
							/>

							<TopSection
								title="Больше всего зависимостей"
								hint="Количество уникальных транзитивных зависимостей"
								items={mostDeps!}
							/>
						</>
					)}
				</div>
			</div>
		</section>
	);
}
