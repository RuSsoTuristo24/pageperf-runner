import type { ApiRunDetails } from '../../lib/api.js';
import { formatMetricValue } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getTargetOrigin } from '../../lib/url.js';

type JsExecutionPanelProps = {
	summary?: ApiRunDetails['jsExecutionSummary'];
	targetUrl?: string;
};

export function JsExecutionPanel({ summary, targetUrl }: JsExecutionPanelProps)
{
	const targetOrigin = getTargetOrigin(targetUrl);
	const resources = summary?.resources ?? [];
	const unattributedTotal = summary?.unattributed.totalMs ?? 0;
	const totalExecutionMs = resources.reduce((total, resource) => total + resource.totalMs, 0) + unattributedTotal;

	if (!summary || (resources.length === 0 && unattributedTotal <= 0))
	{
		return null;
	}

	return (
		<section className="panel panel-js-execution" aria-labelledby="js-execution-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Атрибуция главного потока</p>
					<h2 id="js-execution-heading">JS Execution</h2>
				</div>
				<span className="workspace-context">{formatMetricValue('duration', totalExecutionMs)} total</span>
			</div>

			<div className="js-execution-grid" role="table" aria-label="JS Execution table">
				<div className="js-execution-header" role="row">
					<span role="columnheader">Ресурс</span>
					<span role="columnheader" title="Время парсинга JS-файла браузером">Parse</span>
					<span role="columnheader" title="Время выполнения (evaluate) JS-кода">Eval</span>
					<span role="columnheader" title="Суммарное время Parse + Eval">Итого</span>
					<span role="columnheader" title="Уровень уверенности атрибуции (high/medium/low)">Уверенность</span>
				</div>

				{resources.map((resource) => (
					<div key={resource.url} className="js-execution-row" role="row">
						<div className="js-execution-resource" role="cell">
							<strong className="resource-primary">{getResourceLabel(resource.url)}</strong>
							<span className="resource-meta">{getDisplayUrl(resource.url, targetOrigin)}</span>
						</div>
						<span role="cell">{formatMetricValue('parse', resource.parseMs)}</span>
						<span role="cell">{formatMetricValue('evaluate', resource.evaluateMs)}</span>
						<span role="cell">{formatMetricValue('duration', resource.totalMs)}</span>
						<span role="cell">
							<span className={`issue-badge issue-badge-confidence-${resource.attributionConfidence}`}>
								{resource.attributionConfidence}
							</span>
						</span>
					</div>
				))}

				<div className="js-execution-row js-execution-row-unattributed" role="row">
					<div className="js-execution-resource" role="cell">
						<strong className="resource-primary">не атрибутировано</strong>
						<span className="resource-meta">Эвристическая привязка не смогла отнести эти слайсы к конкретному JS-ассету.</span>
					</div>
					<span role="cell">{formatMetricValue('parse', summary.unattributed.parseMs)}</span>
					<span role="cell">{formatMetricValue('evaluate', summary.unattributed.evaluateMs)}</span>
					<span role="cell">{formatMetricValue('duration', summary.unattributed.totalMs)}</span>
					<span role="cell">
						<span className="issue-badge issue-badge-confidence-low">low</span>
					</span>
				</div>
			</div>
		</section>
	);
}
