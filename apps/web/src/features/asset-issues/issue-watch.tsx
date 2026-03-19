import { useMemo, useState } from 'react';

import type { ApiAssetIssue } from '../../lib/api.js';
import { AssetIssueEditor } from './asset-issue-editor.js';

type IssueWatchProps = {
	issues: ApiAssetIssue[];
	isSavingAssetKey: string | null;
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

function formatDate(value?: string): string
{
	if (!value)
	{
		return 'n/a';
	}

	try
	{
		return new Date(value).toLocaleString('ru-RU', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		});
	}
	catch
	{
		return value;
	}
}

export function IssueWatch({ issues, isSavingAssetKey, onSaveIssue, onDeleteIssue }: IssueWatchProps)
{
	const [statusFilter, setStatusFilter] = useState<'all' | ApiAssetIssue['status']>('all');
	const [typeFilter, setTypeFilter] = useState('all');
	const [returnedOnly, setReturnedOnly] = useState(false);
	const [editingAssetKey, setEditingAssetKey] = useState<string | null>(null);
	const typeOptions = useMemo(() => [...new Set(issues.map((issue) => issue.resourceType))].sort(), [issues]);
	const filteredIssues = issues.filter((issue) => {
		if (statusFilter !== 'all' && issue.status !== statusFilter)
		{
			return false;
		}

		if (typeFilter !== 'all' && issue.resourceType !== typeFilter)
		{
			return false;
		}

		if (returnedOnly && !issue.returnedAfterClose)
		{
			return false;
		}

		return true;
	});

	return (
		<section className="panel panel-issue-watch" aria-labelledby="issue-watch-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Mantis Watch</p>
					<h2 id="issue-watch-heading">Отслеживание</h2>
				</div>
				<p className="panel-kicker">Отслеживаемые ресурсы видны между прогонами. Ресурсы, вернувшиеся после закрытия, маркируются автоматически.</p>
			</div>

			<div className="toolbar-group toolbar-group-watch">
				<label className="toolbar-control">
					<span>Статус</span>
					<select aria-label="Issue Watch Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ApiAssetIssue['status'])}>
						<option value="all">all</option>
						<option value="open">open</option>
						<option value="review">review</option>
						<option value="closed">closed</option>
					</select>
				</label>
				<label className="toolbar-control">
					<span>Тип</span>
					<select aria-label="Issue Watch Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
						<option value="all">all</option>
						{typeOptions.map((type) => (
							<option key={type} value={type}>
								{type === 'script' ? 'js' : type === 'stylesheet' ? 'css' : type}
							</option>
						))}
					</select>
				</label>
				<label className="field-checkbox field-checkbox-inline">
					<input
						aria-label="Only Returned After Close"
						type="checkbox"
						checked={returnedOnly}
						onChange={(event) => setReturnedOnly(event.target.checked)}
					/>
					<span>Только вернувшиеся после закрытия</span>
				</label>
			</div>

			{filteredIssues.length === 0 ? (
				<p className="empty-copy">Нет отслеживаемых ресурсов для этого фильтра.</p>
			) : (
				<ul className="issue-watch-list">
					{filteredIssues.map((issue) => (
						<li key={issue.assetKey} className={`issue-watch-item ${issue.returnedAfterClose ? 'issue-watch-item-returned' : ''}`}>
							<div className="issue-watch-main">
								<div className="issue-watch-copy">
									<strong className="resource-primary">{issue.assetUrl}</strong>
									<div className="issue-watch-meta">
										<span className={`issue-badge issue-badge-${issue.status}`}>{issue.status}</span>
										{issue.returnedAfterClose ? <span className="issue-badge issue-badge-returned">вернулся</span> : null}
										<span className="table-pill">{issue.resourceType === 'script' ? 'js' : issue.resourceType === 'stylesheet' ? 'css' : issue.resourceType}</span>
									</div>
									<a className="issue-watch-link" href={issue.mantisUrl} target="_blank" rel="noreferrer">
										{issue.mantisUrl}
									</a>
								</div>
								<div className="issue-watch-side">
									<span>Создан: {formatDate(issue.createdAt)}</span>
									<span>Закрыт: {formatDate(issue.closedAt)}</span>
									<span>Замечен: {formatDate(issue.lastSeenAt)}</span>
									<button className="secondary-button secondary-button-compact" type="button" onClick={() => setEditingAssetKey((current) => current === issue.assetKey ? null : issue.assetKey)}>
										{editingAssetKey === issue.assetKey ? 'Скрыть' : 'Изменить'}
									</button>
								</div>
							</div>
							{editingAssetKey === issue.assetKey ? (
								<AssetIssueEditor
									assetUrl={issue.assetUrl}
									resourceType={issue.resourceType}
									issue={issue}
									isSaving={isSavingAssetKey === issue.assetKey}
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
							) : null}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
