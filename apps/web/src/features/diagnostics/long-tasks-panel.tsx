import type { ApiRunDetails } from '../../lib/api.js';
import { formatMetricValue } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getTargetOrigin } from '../../lib/url.js';

type LongTasksPanelProps = {
	longTasks?: NonNullable<ApiRunDetails['traceSummary']>['longTasks'];
	targetUrl?: string;
};

export function LongTasksPanel({ longTasks, targetUrl }: LongTasksPanelProps)
{
	if (!longTasks || longTasks.length === 0)
	{
		return null;
	}

	const targetOrigin = getTargetOrigin(targetUrl);
	const totalMs = longTasks.reduce((sum, task) => sum + task.durationMs, 0);

	return (
		<section className="panel panel-long-tasks" aria-labelledby="long-tasks-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Главный поток</p>
					<h2 id="long-tasks-heading">Long Tasks</h2>
				</div>
				<span className="workspace-context">
					{longTasks.length} задач, {formatMetricValue('duration', totalMs)} total
				</span>
			</div>

			<div className="data-table-wrap">
				<table className="data-table" aria-label="Long tasks">
					<thead>
						<tr>
							<th style={{ textAlign: 'left' }} title="URL скрипта, вызвавшего длинную задачу">Скрипт</th>
							<th title="Время начала задачи от начала навигации">Start</th>
							<th title="Длительность задачи">Duration</th>
						</tr>
					</thead>
					<tbody>
						{longTasks.map((task, index) => (
							<tr key={index}>
								<td style={{ textAlign: 'left' }}>
									{task.url ? (
										<>
											<strong className="resource-primary">{getResourceLabel(task.url)}</strong>
											<span className="resource-meta">{getDisplayUrl(task.url, targetOrigin)}</span>
										</>
									) : (
										<span className="resource-meta">не атрибутировано</span>
									)}
								</td>
								<td>{task.startMs !== undefined ? formatMetricValue('duration', task.startMs) : '—'}</td>
								<td>{formatMetricValue('duration', task.durationMs)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
