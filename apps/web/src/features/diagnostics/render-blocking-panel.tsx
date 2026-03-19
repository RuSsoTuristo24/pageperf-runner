import type { ApiRunDetails } from '../../lib/api.js';
import { formatBytes, formatMetricValue } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getResourceTypeLabel, getTargetOrigin } from '../../lib/url.js';

type RenderBlockingPanelProps = {
	resources?: NonNullable<ApiRunDetails['pageDiagnostics']>['renderBlocking'];
	targetUrl?: string;
};

export function RenderBlockingPanel({ resources, targetUrl }: RenderBlockingPanelProps)
{
	if (!resources || resources.length === 0)
	{
		return null;
	}

	const targetOrigin = getTargetOrigin(targetUrl);

	return (
		<section className="panel panel-render-blocking" aria-labelledby="render-blocking-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Блокировка рендеринга</p>
					<h2 id="render-blocking-heading">Render-Blocking Resources</h2>
				</div>
				<span className="workspace-context">
					{resources.length} ресурсов
				</span>
			</div>

			<div className="data-table-wrap">
				<table className="data-table" aria-label="Render-blocking resources">
					<thead>
						<tr>
							<th style={{ textAlign: 'left' }}>Ресурс</th>
							<th>Type</th>
							<th title="Длительность загрузки">Duration</th>
							<th title="Объём переданных данных">Transfer</th>
						</tr>
					</thead>
					<tbody>
						{resources.map((resource) => (
							<tr key={resource.url}>
								<td style={{ textAlign: 'left' }}>
									<strong className="resource-primary">{getResourceLabel(resource.url)}</strong>
									<span className="resource-meta">{getDisplayUrl(resource.url, targetOrigin)}</span>
								</td>
								<td><span className="table-pill">{getResourceTypeLabel(resource.resourceType)}</span></td>
								<td>{formatMetricValue('duration', resource.durationMs)}</td>
								<td>{formatBytes(resource.transferBytes)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
