import { Fragment, useState } from 'react';

import type { ApiAssetIssue } from '../../lib/api.js';
import { getDisplayUrl, getResourceLabel, getResourceTypeLabel, getTargetOrigin } from '../../lib/url.js';
import { AssetIssueEditor } from '../asset-issues/asset-issue-editor.js';
import { hasWaterfallTiming, RequestWaterfall } from './request-waterfall.js';

export type RequestItem = {
	assetKey: string;
	url: string;
	resourceType: string;
	encoding: string;
	duration: string;
	durationMs: number;
	transfer: string;
	transferBytes: number;
	encoded: string;
	encodedBytes: number;
	decoded: string;
	decodedBytes: number;
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
	redirectParentUrl?: string;
	protocol?: string;
	priority?: string;
	issue?: ApiAssetIssue;
};

type RequestTableProps = {
	requestType: string;
	requests: RequestItem[];
	isSavingAssetKey: string | null;
	requestTypes: string[];
	targetUrl?: string;
	onRequestTypeChange: (value: string) => void;
	onSaveIssue: (input: {
		assetKey?: string;
		assetUrl: string;
		resourceType: string;
		mantisUrl: string;
		status: 'open' | 'review' | 'closed';
		note: string;
	}) => Promise<void>;
	onDeleteIssue: (assetKey: string) => Promise<void>;
};

type RequestColumnKey = 'type' | 'duration' | 'transfer' | 'encoded' | 'decoded' | 'encoding';
type RequestSortKey = 'url' | 'type' | 'duration' | 'transfer' | 'encoded' | 'decoded' | 'encoding';

type VisibleColumns = Record<RequestColumnKey, boolean>;

const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
	type: true,
	duration: true,
	transfer: true,
	encoded: true,
	decoded: true,
	encoding: true,
};

const COLUMN_LABELS: Record<RequestColumnKey, string> = {
	type: 'Type',
	duration: 'Dur',
	transfer: 'Transfer',
	encoded: 'Enc',
	decoded: 'Dec',
	encoding: 'Encoding',
};

const COLUMN_TOOLTIPS: Record<RequestSortKey, string> = {
	url: 'URL запроса',
	type: 'Тип ресурса (document, script, stylesheet и т.д.)',
	duration: 'Общее время выполнения запроса',
	transfer: 'Объём данных, переданных по сети (с заголовками)',
	encoded: 'Размер тела ответа после сжатия (gzip/br)',
	decoded: 'Размер тела ответа после декомпрессии',
	encoding: 'Алгоритм сжатия (gzip, br, none)',
};

function sortRequests(requests: RequestItem[], sortKey: RequestSortKey, sortDirection: 'asc' | 'desc'): RequestItem[]
{
	const sortedRequests = [...requests];
	const sortFactor = sortDirection === 'asc' ? 1 : -1;

	sortedRequests.sort((left, right) => {
		switch (sortKey)
		{
			case 'type':
				return getResourceTypeLabel(left.resourceType).localeCompare(getResourceTypeLabel(right.resourceType)) * sortFactor;
			case 'duration':
				return (left.durationMs - right.durationMs) * sortFactor;
			case 'transfer':
				return (left.transferBytes - right.transferBytes) * sortFactor;
			case 'encoded':
				return (left.encodedBytes - right.encodedBytes) * sortFactor;
			case 'decoded':
				return (left.decodedBytes - right.decodedBytes) * sortFactor;
			case 'encoding':
				return left.encoding.localeCompare(right.encoding) * sortFactor;
			case 'url':
			default:
				return getDisplayUrl(left.url).localeCompare(getDisplayUrl(right.url)) * sortFactor;
		}
	});

	return sortedRequests;
}

export function RequestTable({
	requestType,
	requests,
	isSavingAssetKey,
	requestTypes,
	targetUrl,
	onRequestTypeChange,
	onSaveIssue,
	onDeleteIssue,
}: RequestTableProps)
{
	const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(DEFAULT_VISIBLE_COLUMNS);
	const [sortKey, setSortKey] = useState<RequestSortKey>('decoded');
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
	const [editingAssetKey, setEditingAssetKey] = useState<string | null>(null);
	const targetOrigin = getTargetOrigin(targetUrl);

	const sortedRequests = sortRequests(requests, sortKey, sortDirection);

	function handleColumnToggle(columnKey: RequestColumnKey): void
	{
		setVisibleColumns((currentColumns) => ({
			...currentColumns,
			[columnKey]: !currentColumns[columnKey],
		}));
	}

	function handleSort(nextSortKey: RequestSortKey): void
	{
		if (sortKey === nextSortKey)
		{
			setSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc');

			return;
		}

		setSortKey(nextSortKey);
		setSortDirection(nextSortKey === 'url' ? 'asc' : 'desc');
	}

	function getSortIndicator(columnKey: RequestSortKey): string
	{
		if (sortKey !== columnKey)
		{
			return '';
		}

		return sortDirection === 'asc' ? ' ↑' : ' ↓';
	}

	const visibleColumnCount = 1 + Object.values(visibleColumns).filter(Boolean).length;
	const totalColumnCount = visibleColumnCount + 1;
	const showWaterfall = hasWaterfallTiming(sortedRequests);

	return (
		<section className="panel panel-resource" aria-labelledby="requests-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Сеть</p>
					<h2 id="requests-heading">Запросы</h2>
				</div>
				<div className="toolbar-group toolbar-group-request">
					<label className="toolbar-control">
						<span>Тип запроса</span>
						<select
							aria-label="Тип запроса"
							value={requestType}
							onChange={(event) => onRequestTypeChange(event.target.value)}
						>
							<option value="all">all</option>
							{requestTypes.map((type) => (
								<option key={type} value={type}>
									{getResourceTypeLabel(type)}
								</option>
							))}
						</select>
					</label>
					<fieldset className="column-toggle-group">
						<legend>Столбцы</legend>
						{(Object.keys(COLUMN_LABELS) as RequestColumnKey[]).map((columnKey) => (
							<label key={columnKey} className="column-toggle">
								<input
									checked={visibleColumns[columnKey]}
									type="checkbox"
									aria-label={COLUMN_LABELS[columnKey]}
									onChange={() => handleColumnToggle(columnKey)}
								/>
								<span>{COLUMN_LABELS[columnKey]}</span>
							</label>
						))}
					</fieldset>
				</div>
			</div>

			{showWaterfall ? (
				<RequestWaterfall requests={sortedRequests} targetUrl={targetUrl} />
			) : null}

			<div className="data-table-wrap">
				<table className="data-table data-table-requests" aria-label="Requests table">
					<colgroup>
						<col className="col-resource-primary" />
						{visibleColumns.type ? <col className="col-type" /> : null}
						{visibleColumns.duration ? <col className="col-duration" /> : null}
						{visibleColumns.transfer ? <col className="col-size" /> : null}
						{visibleColumns.encoded ? <col className="col-size" /> : null}
						{visibleColumns.decoded ? <col className="col-size" /> : null}
						{visibleColumns.encoding ? <col className="col-encoding col-encoding-last" /> : null}
						<col className="col-action" />
					</colgroup>
					<thead>
						<tr>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.url} onClick={() => handleSort('url')}>
									URL{getSortIndicator('url')}
								</button>
							</th>
							{visibleColumns.type ? (
								<th>
									<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.type} onClick={() => handleSort('type')}>
										Type{getSortIndicator('type')}
									</button>
								</th>
							) : null}
							{visibleColumns.duration ? (
								<th>
									<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.duration} onClick={() => handleSort('duration')}>
										Dur{getSortIndicator('duration')}
									</button>
								</th>
							) : null}
							{visibleColumns.transfer ? (
								<th>
									<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.transfer} onClick={() => handleSort('transfer')}>
										Transfer{getSortIndicator('transfer')}
									</button>
								</th>
							) : null}
							{visibleColumns.encoded ? (
								<th>
									<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.encoded} onClick={() => handleSort('encoded')}>
										Enc{getSortIndicator('encoded')}
									</button>
								</th>
							) : null}
							{visibleColumns.decoded ? (
								<th>
									<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.decoded} onClick={() => handleSort('decoded')}>
										Dec{getSortIndicator('decoded')}
									</button>
								</th>
							) : null}
							{visibleColumns.encoding ? (
								<th>
									<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.encoding} onClick={() => handleSort('encoding')}>
										Encoding{getSortIndicator('encoding')}
									</button>
								</th>
							) : null}
							<th title="Отслеживание проблемных ассетов через Mantis bug tracker">Mantis</th>
						</tr>
					</thead>
					<tbody>
						{sortedRequests.length === 0 ? (
							<tr>
								<td colSpan={totalColumnCount} className="empty-cell">Нет запросов для данного фильтра.</td>
							</tr>
						) : null}
						{sortedRequests.map((request) => (
							<Fragment key={`${request.resourceType}-${request.assetKey}`}>
								<tr
									className={[
										request.issue ? 'resource-row-tracked' : '',
										request.issue?.returnedAfterClose ? 'resource-row-returned' : '',
									].filter(Boolean).join(' ') || undefined}
								>
									<td className="resource-url-cell">
										<strong className="resource-primary">{getResourceLabel(request.url)}</strong>
										<span className="resource-meta">{getDisplayUrl(request.url, targetOrigin)}</span>
										{request.issue ? (
											<span className="resource-badges">
												<span className={`issue-badge issue-badge-${request.issue.status}`}>{request.issue.status}</span>
												{request.issue.returnedAfterClose ? <span className="issue-badge issue-badge-returned">returned</span> : null}
											</span>
										) : null}
									</td>
									{visibleColumns.type ? <td><span className="table-pill">{getResourceTypeLabel(request.resourceType)}</span></td> : null}
									{visibleColumns.duration ? <td>{request.duration}</td> : null}
									{visibleColumns.transfer ? <td>{request.transfer}</td> : null}
									{visibleColumns.encoded ? <td>{request.encoded}</td> : null}
									{visibleColumns.decoded ? <td>{request.decoded}</td> : null}
									{visibleColumns.encoding ? <td>{request.encoding}</td> : null}
									<td>
										<button className="secondary-button secondary-button-compact" type="button" onClick={() => setEditingAssetKey((current) => current === request.assetKey ? null : request.assetKey)}>
											{request.issue ? 'Изменить' : 'Отслеживать'}
										</button>
									</td>
								</tr>
								{editingAssetKey === request.assetKey ? (
									<tr className="issue-editor-row">
										<td colSpan={totalColumnCount}>
											<AssetIssueEditor
												assetUrl={request.url}
												resourceType={request.resourceType}
												issue={request.issue}
												isSaving={isSavingAssetKey === request.assetKey}
												onCancel={() => setEditingAssetKey(null)}
												onDelete={async (assetKey) => {
													await onDeleteIssue(assetKey);
													setEditingAssetKey(null);
												}}
												onSave={async (input) => {
													await onSaveIssue(input);
													setEditingAssetKey(null);
												}}
											/>
										</td>
									</tr>
								) : null}
							</Fragment>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
