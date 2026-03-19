import type { ApiRunDetails } from '../../lib/api.js';
import { formatBytes, formatMetricValue } from '../../lib/format.js';

type ThirdPartyPanelProps = {
	summary?: NonNullable<ApiRunDetails['pageDiagnostics']>['thirdParty'];
};

export function ThirdPartyPanel({ summary }: ThirdPartyPanelProps)
{
	if (!summary || summary.origins.length === 0)
	{
		return null;
	}

	return (
		<section className="panel panel-third-party" aria-labelledby="third-party-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Сторонние ресурсы</p>
					<h2 id="third-party-heading">Third-Party Impact</h2>
				</div>
				<span className="workspace-context">
					{summary.origins.length} origins, {formatBytes(summary.totalTransferBytes)} total
				</span>
			</div>

			<div className="data-table-wrap">
				<table className="data-table" aria-label="Third-party origins">
					<thead>
						<tr>
							<th style={{ textAlign: 'left' }} title="Домен стороннего ресурса">Origin</th>
							<th title="Объём данных, переданных по сети">Transfer</th>
							<th title="Количество HTTP-запросов к этому origin">Запросы</th>
							<th title="Суммарное время выполнения JS от этого origin на главном потоке">JS Blocking</th>
						</tr>
					</thead>
					<tbody>
						{summary.origins.map((origin) => (
							<tr key={origin.origin}>
								<td style={{ textAlign: 'left' }}>
									<strong className="resource-primary">{origin.origin}</strong>
								</td>
								<td>{formatBytes(origin.transferBytes)}</td>
								<td>{origin.requestCount}</td>
								<td>{origin.blockingTimeMs > 0 ? formatMetricValue('duration', origin.blockingTimeMs) : '\u2014'}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
