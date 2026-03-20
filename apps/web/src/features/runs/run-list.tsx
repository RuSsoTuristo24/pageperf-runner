import { useState } from 'react';

type RunItem = {
	id: string;
	page: string;
	profile: string;
	status: string;
	context: string;
	createdAt?: string;
};

function formatRelativeTime(isoDate?: string): string {
	if (!isoDate) return '';
	try {
		const date = new Date(isoDate);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'только что';
		if (diffMin < 60) return `${diffMin} мин назад`;
		const diffHours = Math.floor(diffMin / 60);
		if (diffHours < 24) return `${diffHours} ч назад`;
		const diffDays = Math.floor(diffHours / 24);
		if (diffDays < 7) return `${diffDays} д назад`;
		return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
	} catch {
		return '';
	}
}

type RunListProps = {
	runs: RunItem[];
	selectedRunId?: string | null;
	onRunSelect?: (runId: string) => void;
	onRunDelete?: (runId: string) => void;
};

export function RunList({ runs, selectedRunId, onRunSelect, onRunDelete }: RunListProps)
{
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	return (
		<section className="sidebar-section" aria-labelledby="runs-heading">
			<div className="sidebar-section-heading">
				<div>
					<p className="eyebrow">Сохранённые сессии</p>
					<h2 id="runs-heading">Прогоны</h2>
				</div>
				<span className="sidebar-count">{runs.length}</span>
			</div>

			{runs.length === 0 ? <p className="empty-copy">Прогонов пока нет.</p> : null}

			<ul className="run-list">
				{runs.map((run) => (
					<li key={run.id} className="run-list-row">
						<button
							type="button"
							className={`run-list-item ${selectedRunId === run.id ? 'is-selected' : ''}`}
							aria-pressed={selectedRunId === run.id}
							onClick={() => onRunSelect?.(run.id)}
						>
							{onRunDelete && confirmDeleteId === run.id ? (
								<div className="run-list-confirm" onClick={(e) => e.stopPropagation()}>
									<button
										type="button"
										className="run-list-confirm-btn run-list-confirm-yes"
										onClick={(e) => { e.stopPropagation(); onRunDelete(run.id); setConfirmDeleteId(null); }}
									>
										Удалить
									</button>
									<button
										type="button"
										className="run-list-confirm-btn run-list-confirm-no"
										onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
									>
										Отмена
									</button>
								</div>
							) : null}
							<div className="run-list-topline">
								<strong>{run.profile}</strong>
								<span className={`status-pill status-${run.status}`}>{run.status}</span>
							</div>
							<p className="run-list-page">{run.page}</p>
							<div className="run-list-meta">
								<span>{run.context}</span>
								<span>{formatRelativeTime(run.createdAt)}</span>
								<span className="run-id">{run.id.slice(0, 8)}</span>
							</div>
						</button>
						{onRunDelete ? (
							<button
								type="button"
								className="run-list-delete"
								title="Удалить прогон"
								onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(confirmDeleteId === run.id ? null : run.id); }}
							>
								×
							</button>
						) : null}
					</li>
				))}
			</ul>
		</section>
	);
}
