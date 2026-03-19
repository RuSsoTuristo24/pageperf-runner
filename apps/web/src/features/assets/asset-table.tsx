import { Fragment, useState } from 'react';

import type { ApiAssetIssue } from '../../lib/api.js';
import { getDisplayUrl, getResourceLabel, getResourceTypeLabel, getTargetOrigin } from '../../lib/url.js';
import { AssetIssueEditor } from '../asset-issues/asset-issue-editor.js';

type AssetItem = {
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

type AssetTableProps = {
	assetType: string;
	assets: AssetItem[];
	assetTypes: string[];
	heavyAssetCount: number;
	heavyAssetThresholdMb: string;
	isSavingAssetKey: string | null;
	targetUrl?: string;
	onAssetTypeChange: (value: string) => void;
	onHeavyAssetThresholdMbChange: (value: string) => void;
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

type AssetSortKey = 'url' | 'type' | 'duration' | 'encoded' | 'decoded' | 'expansion' | 'compression';

const COLUMN_TOOLTIPS: Record<AssetSortKey, string> = {
	url: 'URL ресурса',
	type: 'Тип ресурса (JS, CSS, изображение и т.д.)',
	duration: 'Время загрузки ресурса в миллисекундах',
	encoded: 'Размер тела ответа после сжатия (gzip/br)',
	decoded: 'Размер тела ответа после декомпрессии',
	expansion: 'Коэффициент расширения decoded/encoded',
	compression: 'Алгоритм сжатия (gzip, br, none)',
};

function sortAssets(assets: AssetItem[], sortKey: AssetSortKey, sortDirection: 'asc' | 'desc'): AssetItem[]
{
	const sortedAssets = [...assets];
	const sortFactor = sortDirection === 'asc' ? 1 : -1;

	sortedAssets.sort((left, right) => {
		switch (sortKey)
		{
			case 'type':
				return getResourceTypeLabel(left.resourceType).localeCompare(getResourceTypeLabel(right.resourceType)) * sortFactor;
			case 'duration':
				return (left.durationMs - right.durationMs) * sortFactor;
			case 'encoded':
				return (left.encodedBytes - right.encodedBytes) * sortFactor;
			case 'decoded':
				return (left.decodedBytes - right.decodedBytes) * sortFactor;
			case 'expansion':
				return ((left.expansionRatio ?? 0) - (right.expansionRatio ?? 0)) * sortFactor;
			case 'compression':
				return left.compression.localeCompare(right.compression) * sortFactor;
			case 'url':
			default:
				return getDisplayUrl(left.url).localeCompare(getDisplayUrl(right.url)) * sortFactor;
		}
	});

	return sortedAssets;
}

export function AssetTable({
	assetType,
	assets,
	assetTypes,
	heavyAssetCount,
	heavyAssetThresholdMb,
	isSavingAssetKey,
	targetUrl,
	onAssetTypeChange,
	onHeavyAssetThresholdMbChange,
	onSaveIssue,
	onDeleteIssue,
}: AssetTableProps)
{
	const [sortKey, setSortKey] = useState<AssetSortKey>('decoded');
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
	const [editingAssetKey, setEditingAssetKey] = useState<string | null>(null);
	const targetOrigin = getTargetOrigin(targetUrl);
	const heavyAssetLabel = Number(heavyAssetThresholdMb) > 0
		? `> ${Number(heavyAssetThresholdMb).toFixed(2)} МБ`
		: 'disabled';
	const sortedAssets = sortAssets(assets, sortKey, sortDirection);

	function handleSort(nextSortKey: AssetSortKey): void
	{
		if (sortKey === nextSortKey)
		{
			setSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc');

			return;
		}

		setSortKey(nextSortKey);
		setSortDirection(nextSortKey === 'url' ? 'asc' : 'desc');
	}

	function getSortIndicator(columnKey: AssetSortKey): string
	{
		if (sortKey !== columnKey)
		{
			return '';
		}

		return sortDirection === 'asc' ? ' ↑' : ' ↓';
	}

	return (
		<section className="panel panel-resource" aria-labelledby="assets-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Нагрузка</p>
					<h2 id="assets-heading">Ресурсы</h2>
				</div>
				<div className="toolbar-group">
					<p className="toolbar-chip">
						<span>Тяжёлых decoded: {heavyAssetCount}</span>
						<strong>{heavyAssetLabel}</strong>
					</p>
					<label className="toolbar-control">
						<span>Тип ресурса</span>
						<select
							aria-label="Тип ресурса"
							value={assetType}
							onChange={(event) => onAssetTypeChange(event.target.value)}
						>
							<option value="all">all</option>
							{assetTypes.map((type) => (
								<option key={type} value={type}>
									{getResourceTypeLabel(type)}
								</option>
							))}
						</select>
					</label>
					<label className="toolbar-control toolbar-control-threshold">
						<span>Порог decoded (МБ)</span>
						<input
							aria-label="Порог decoded (МБ)"
							inputMode="decimal"
							type="number"
							min="0"
							step="0.1"
							value={heavyAssetThresholdMb}
							onChange={(event) => onHeavyAssetThresholdMbChange(event.target.value)}
						/>
					</label>
				</div>
			</div>

			<div className="data-table-wrap">
				<table className="data-table data-table-assets" aria-label="Assets table">
					<colgroup>
						<col className="col-resource-primary" />
						<col className="col-type" />
						<col className="col-duration" />
						<col className="col-size" />
						<col className="col-size" />
						<col className="col-expansion" />
						<col className="col-compression" />
						<col className="col-action" />
					</colgroup>
					<thead>
						<tr>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.url} onClick={() => handleSort('url')}>
									Ресурс{getSortIndicator('url')}
								</button>
							</th>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.type} onClick={() => handleSort('type')}>
									Type{getSortIndicator('type')}
								</button>
							</th>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.duration} onClick={() => handleSort('duration')}>
									Dur{getSortIndicator('duration')}
								</button>
							</th>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.encoded} onClick={() => handleSort('encoded')}>
									Enc{getSortIndicator('encoded')}
								</button>
							</th>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.decoded} onClick={() => handleSort('decoded')}>
									Dec{getSortIndicator('decoded')}
								</button>
							</th>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.expansion} onClick={() => handleSort('expansion')}>
									Exp{getSortIndicator('expansion')}
								</button>
							</th>
							<th>
								<button type="button" className="table-sort-button" title={COLUMN_TOOLTIPS.compression} onClick={() => handleSort('compression')}>
									Comp{getSortIndicator('compression')}
								</button>
							</th>
							<th>Mantis</th>
						</tr>
					</thead>
					<tbody>
						{sortedAssets.length === 0 ? (
							<tr>
								<td colSpan={8} className="empty-cell">Нет ресурсов для данного фильтра.</td>
							</tr>
						) : null}
						{sortedAssets.map((asset) => (
							<Fragment key={`${asset.assetKey}-${asset.encodedBytes}`}>
								<tr
									className={[
										asset.isHeavy ? 'asset-row-heavy' : '',
										asset.issue ? 'resource-row-tracked' : '',
										asset.issue?.returnedAfterClose ? 'resource-row-returned' : '',
									].filter(Boolean).join(' ') || undefined}
								>
									<td className="resource-url-cell">
										<strong className="resource-primary">{getResourceLabel(asset.url)}</strong>
										<span className="resource-meta">{getDisplayUrl(asset.url, targetOrigin)}</span>
										{asset.issue ? (
											<span className="resource-badges">
												<span className={`issue-badge issue-badge-${asset.issue.status}`}>{asset.issue.status}</span>
												{asset.issue.returnedAfterClose ? <span className="issue-badge issue-badge-returned">returned</span> : null}
											</span>
										) : null}
									</td>
									<td><span className="table-pill">{getResourceTypeLabel(asset.resourceType)}</span></td>
									<td>{asset.duration}</td>
									<td>{asset.encoded}</td>
									<td>
										<span>{asset.decoded}</span>
										{asset.isHeavy ? <span className="heavy-asset-badge">{heavyAssetLabel}</span> : null}
									</td>
									<td>{asset.expansion}</td>
									<td>{asset.compression}</td>
									<td>
										<button className="secondary-button secondary-button-compact" type="button" onClick={() => setEditingAssetKey((current) => current === asset.assetKey ? null : asset.assetKey)}>
											{asset.issue ? 'Изменить' : 'Отслеживать'}
										</button>
									</td>
								</tr>
								{editingAssetKey === asset.assetKey ? (
									<tr className="issue-editor-row">
										<td colSpan={8}>
											<AssetIssueEditor
												assetUrl={asset.url}
												resourceType={asset.resourceType}
												issue={asset.issue}
												isSaving={isSavingAssetKey === asset.assetKey}
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
