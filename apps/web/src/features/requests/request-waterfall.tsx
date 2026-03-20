import { useState } from 'react';

import { formatMetricValue } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getTargetOrigin } from '../../lib/url.js';

type RequestWaterfallItem = {
	assetKey: string;
	url: string;
	resourceType: string;
	durationMs: number;
	startTimeMs?: number;
	endTimeMs?: number;
	queueingMs?: number;
	dnsMs?: number;
	connectMs?: number;
	sslMs?: number;
	requestSentMs?: number;
	waitingMs?: number;
	downloadMs?: number;
	initiatorType?: 'parser' | 'script' | 'preload' | 'fetch' | 'xmlhttprequest' | 'other';
	initiatorUrl?: string;
	protocol?: string;
	priority?: string;
};

type RequestWaterfallProps = {
	requests: RequestWaterfallItem[];
	targetUrl?: string;
};

type PhaseItem = {
	key: string;
	label: string;
	value: number;
};

const PHASE_DEFINITIONS: Array<{
	key: PhaseItem['key'];
	label: PhaseItem['label'];
	hint: string;
	pick: (request: RequestWaterfallItem) => number | undefined;
}> = [
	{ key: 'queueing', label: 'Queue', hint: 'Время ожидания в очереди браузера. Браузер ограничивает число одновременных соединений к одному домену.', pick: (request) => request.queueingMs },
	{ key: 'dns', label: 'DNS', hint: 'Резолв доменного имени в IP-адрес. Происходит только при первом запросе к домену, дальше кешируется.', pick: (request) => request.dnsMs },
	{ key: 'connect', label: 'Connect', hint: 'Установка TCP-соединения с сервером. На HTTP/2 переиспользуется для последующих запросов к тому же домену.', pick: (request) => request.connectMs },
	{ key: 'ssl', label: 'SSL', hint: 'TLS handshake — установка шифрованного соединения. Только для HTTPS, только при первом соединении.', pick: (request) => request.sslMs },
	{ key: 'requestSent', label: 'Send', hint: 'Время отправки HTTP-запроса серверу. Обычно мизерное, заметно только при больших POST-запросах.', pick: (request) => request.requestSentMs },
	{ key: 'waiting', label: 'Wait', hint: 'Ожидание первого байта ответа от сервера (TTFB). Самая важная фаза — показывает, сколько сервер обрабатывал запрос.', pick: (request) => request.waitingMs },
	{ key: 'download', label: 'Download', hint: 'Скачивание тела ответа. Зависит от размера ресурса и пропускной способности канала.', pick: (request) => request.downloadMs },
];

function toFiniteNumber(value: number | undefined): number | null
{
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildPhases(request: RequestWaterfallItem): PhaseItem[]
{
	return PHASE_DEFINITIONS.flatMap((definition) => {
		const value = toFiniteNumber(definition.pick(request));

		return value && value > 0
			? [{ key: definition.key, label: definition.label, value }]
			: [];
	});
}

function getPhaseHint(phaseKey: string): string
{
	return PHASE_DEFINITIONS.find((d) => d.key === phaseKey)?.hint ?? '';
}

export function hasWaterfallTiming(requests: RequestWaterfallItem[]): boolean
{
	return requests.some((request) => {
		const start = toFiniteNumber(request.startTimeMs);
		const end = toFiniteNumber(request.endTimeMs);

		return start !== null && end !== null && end >= start;
	});
}

function WaterfallRow({ request, maxEndTime, targetOrigin }: {
	request: RequestWaterfallItem;
	maxEndTime: number;
	targetOrigin?: string;
})
{
	const [hoveredPhase, setHoveredPhase] = useState<string | null>(null);

	const startTime = toFiniteNumber(request.startTimeMs) ?? 0;
	const endTime = toFiniteNumber(request.endTimeMs) ?? request.durationMs;
	const total = Math.max(0, endTime - startTime);
	const phases = buildPhases(request);
	const safeTotal = total > 0 ? total : phases.reduce((sum, phase) => sum + phase.value, 0) || 1;
	const label = getResourceLabel(request.url);
	const displayUrl = getDisplayUrl(request.url, targetOrigin);

	return (
		<div
			className="waterfall-row"
			aria-label={`Waterfall row ${displayUrl}`}
		>
			<div className="waterfall-row-copy">
				<div className="waterfall-row-heading">
					<strong className="resource-primary">{label}</strong>
					<div className="resource-badges">
						<span className="table-pill">{request.resourceType}</span>
						{request.initiatorType ? <span className="table-pill">{request.initiatorType}</span> : null}
						{request.protocol ? <span className="table-pill">{request.protocol}</span> : null}
						{request.priority ? <span className="table-pill">{request.priority}</span> : null}
					</div>
				</div>
				<span className="resource-meta">{displayUrl}</span>
				{request.initiatorUrl ? (
					<span className="waterfall-initiator">
						Initiator: {getDisplayUrl(request.initiatorUrl, targetOrigin)}
					</span>
				) : null}
			</div>

			<div className="waterfall-track" aria-hidden="true">
				<div
					className="waterfall-bar"
					style={{
						marginLeft: `${(startTime / maxEndTime) * 100}%`,
						width: `${Math.max(4, (total / maxEndTime) * 100)}%`,
					}}
				>
					{phases.map((phase) => (
						<span
							key={phase.key}
							className={`waterfall-segment waterfall-segment-${phase.key} ${hoveredPhase === phase.key ? 'is-highlighted' : ''}`}
							title={`${phase.label}: ${formatMetricValue('duration', phase.value)}`}
							onMouseEnter={() => setHoveredPhase(phase.key)}
							onMouseLeave={() => setHoveredPhase(null)}
							style={{
								width: `${(phase.value / safeTotal) * 100}%`,
							}}
						/>
					))}
				</div>
			</div>

			<div className="waterfall-phase-list">
				{phases.map((phase) => (
					<span
						key={phase.key}
						className={`waterfall-phase-pill waterfall-phase-${phase.key} ${hoveredPhase === phase.key ? 'is-highlighted' : ''}`}
						title={getPhaseHint(phase.key)}
						onMouseEnter={() => setHoveredPhase(phase.key)}
						onMouseLeave={() => setHoveredPhase(null)}
					>
						<span className={`waterfall-phase-dot waterfall-segment-${phase.key}`} />
						{phase.label} {formatMetricValue('duration', phase.value)}
					</span>
				))}
			</div>
		</div>
	);
}

export function RequestWaterfall({ requests, targetUrl }: RequestWaterfallProps)
{
	const targetOrigin = getTargetOrigin(targetUrl);
	const waterfallRequests = requests.filter((request) => {
		const start = toFiniteNumber(request.startTimeMs);
		const end = toFiniteNumber(request.endTimeMs);

		return start !== null && end !== null && end >= start;
	});

	if (waterfallRequests.length === 0)
	{
		return null;
	}

	const maxEndTime = Math.max(
		...waterfallRequests.map((request) => toFiniteNumber(request.endTimeMs) ?? request.durationMs),
		1,
	);

	return (
		<section className="panel panel-waterfall" aria-labelledby="waterfall-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Network Timeline</p>
					<h2 id="waterfall-heading">Waterfall</h2>
				</div>
				<span className="workspace-context">{formatMetricValue('duration', maxEndTime)} total</span>
			</div>

			<div className="waterfall-legend">
				<span className="waterfall-legend-item" title="Время ожидания в очереди браузера"><span className="waterfall-legend-swatch waterfall-segment-queueing" /> Очередь</span>
				<span className="waterfall-legend-item" title="Резолв доменного имени в IP-адрес"><span className="waterfall-legend-swatch waterfall-segment-dns" /> DNS</span>
				<span className="waterfall-legend-item" title="Установка TCP-соединения с сервером"><span className="waterfall-legend-swatch waterfall-segment-connect" /> Соединение</span>
				<span className="waterfall-legend-item" title="TLS handshake — установка шифрованного соединения"><span className="waterfall-legend-swatch waterfall-segment-ssl" /> SSL</span>
				<span className="waterfall-legend-item" title="Время отправки HTTP-запроса серверу"><span className="waterfall-legend-swatch waterfall-segment-requestSent" /> Отправка</span>
				<span className="waterfall-legend-item" title="Ожидание первого байта ответа от сервера (TTFB)"><span className="waterfall-legend-swatch waterfall-segment-waiting" /> Ожидание</span>
				<span className="waterfall-legend-item" title="Скачивание тела ответа"><span className="waterfall-legend-swatch waterfall-segment-download" /> Загрузка</span>
			</div>

			<div className="waterfall-list">
				{waterfallRequests.map((request) => (
					<WaterfallRow
						key={`${request.assetKey}-${request.url}`}
						request={request}
						maxEndTime={maxEndTime}
						targetOrigin={targetOrigin}
					/>
				))}
			</div>
		</section>
	);
}
