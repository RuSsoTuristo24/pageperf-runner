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

const RESOURCE_TYPE_HINTS: Record<string, string> = {
	document: 'HTML-документ страницы. Основной запрос, с которого начинается загрузка.',
	script: 'JavaScript-файл. Загружается через <script> или динамически.',
	stylesheet: 'CSS-файл. Загружается через <link rel="stylesheet">.',
	image: 'Изображение (PNG, JPG, SVG, WebP и т.д.).',
	font: 'Шрифт (WOFF2, TTF и т.д.). Загружается через @font-face.',
	fetch: 'Запрос через fetch() API. Обычно AJAX-запрос к бэкенду.',
	xmlhttprequest: 'XMLHttpRequest (XHR). Устаревший AJAX, до fetch().',
	media: 'Аудио или видео.',
	websocket: 'WebSocket-соединение. Постоянный двусторонний канал.',
	other: 'Прочий ресурс (manifest, favicon и т.д.).',
};

function getResourceTypeHint(resourceType: string): string
{
	return RESOURCE_TYPE_HINTS[resourceType] ?? `Тип ресурса: ${resourceType}`;
}

const INITIATOR_TYPE_HINTS: Record<string, string> = {
	parser: 'HTML-парсер. Ресурс найден при разборе HTML (теги <script>, <link>, <img>).',
	script: 'JavaScript. Ресурс загружен динамически из JS-кода.',
	preload: '<link rel="preload">. Ресурс загружен заранее по подсказке разработчика.',
	fetch: 'fetch() API. Программный запрос данных.',
	xmlhttprequest: 'XMLHttpRequest. Программный запрос данных (устаревший API).',
	other: 'Другой источник (redirect, serviceworker и т.д.).',
};

function getInitiatorTypeHint(initiatorType: string): string
{
	return INITIATOR_TYPE_HINTS[initiatorType] ?? `Инициатор: ${initiatorType}`;
}

function getProtocolHint(protocol: string): string
{
	const hints: Record<string, string> = {
		'h2': 'HTTP/2. Мультиплексирование запросов через одно TCP-соединение, сжатие заголовков.',
		'h3': 'HTTP/3 (QUIC). Работает поверх UDP, быстрее установка соединения, нет head-of-line blocking.',
		'http/1.1': 'HTTP/1.1. Один запрос на соединение, до 6 параллельных TCP-соединений к домену.',
	};

	return hints[protocol] ?? `Протокол: ${protocol}`;
}

function getPriorityHint(priority: string): string
{
	const hints: Record<string, string> = {
		'VeryHigh': 'Очень высокий приоритет. Основной документ (HTML).',
		'High': 'Высокий приоритет. CSS, шрифты, синхронные JS в <head>.',
		'Medium': 'Средний приоритет. Обычные скрипты, preload-ресурсы.',
		'Low': 'Низкий приоритет. Изображения вне viewport, async-скрипты.',
		'VeryLow': 'Очень низкий приоритет. Prefetch, фоновые ресурсы.',
	};

	return hints[priority] ?? `Приоритет: ${priority}`;
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
						<span className="table-pill" title={getResourceTypeHint(request.resourceType)}>{request.resourceType}</span>
						{request.initiatorType ? <span className="table-pill" title={getInitiatorTypeHint(request.initiatorType)}>{request.initiatorType}</span> : null}
						{request.protocol ? <span className="table-pill" title={getProtocolHint(request.protocol)}>{request.protocol}</span> : null}
						{request.priority ? <span className="table-pill" title={getPriorityHint(request.priority)}>{request.priority}</span> : null}
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
	const [filterType, setFilterType] = useState('all');
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

	// maxEndTime always from ALL requests (so the timeline scale stays consistent)
	const maxEndTime = Math.max(
		...waterfallRequests.map((request) => toFiniteNumber(request.endTimeMs) ?? request.durationMs),
		1,
	);

	const resourceTypes = [...new Set(waterfallRequests.map((r) => r.resourceType))].sort();
	const visibleRequests = filterType === 'all'
		? waterfallRequests
		: waterfallRequests.filter((r) => r.resourceType === filterType);

	return (
		<section className="panel panel-waterfall" aria-labelledby="waterfall-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Network Timeline</p>
					<h2 id="waterfall-heading">Waterfall</h2>
				</div>
				<div className="toolbar-group">
					<label className="toolbar-control">
						<span>Тип</span>
						<select
							aria-label="Фильтр по типу ресурса"
							value={filterType}
							onChange={(event) => setFilterType(event.target.value)}
						>
							<option value="all">all ({waterfallRequests.length})</option>
							{resourceTypes.map((type) => (
								<option key={type} value={type}>
									{type} ({waterfallRequests.filter((r) => r.resourceType === type).length})
								</option>
							))}
						</select>
					</label>
					<span className="workspace-context">{formatMetricValue('duration', maxEndTime)} total</span>
				</div>
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
				{visibleRequests.map((request) => (
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
