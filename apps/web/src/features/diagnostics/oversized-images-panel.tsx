import type { ApiRunDetails } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getTargetOrigin } from '../../lib/url.js';

type OversizedImagesPanelProps = {
	images?: NonNullable<ApiRunDetails['pageDiagnostics']>['oversizedImages'];
	targetUrl?: string;
};

export function OversizedImagesPanel({ images, targetUrl }: OversizedImagesPanelProps)
{
	if (!images || images.length === 0)
	{
		return null;
	}

	const targetOrigin = getTargetOrigin(targetUrl);
	const totalWasted = images.reduce((sum, img) => sum + img.estimatedWastedBytes, 0);

	return (
		<section className="panel panel-oversized-images" aria-labelledby="oversized-images-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Изображения</p>
					<h2 id="oversized-images-heading">Oversized Images</h2>
				</div>
				<span className="workspace-context">
					{images.length} шт, ~{formatBytes(totalWasted)} лишних
				</span>
			</div>

			<div className="data-table-wrap">
				<table className="data-table" aria-label="Oversized images">
					<thead>
						<tr>
							<th style={{ textAlign: 'left' }}>Изображение</th>
							<th title="Реальный размер изображения (naturalWidth x naturalHeight)">Оригинал</th>
							<th title="Размер отображения на странице (clientWidth x clientHeight)">Отображение</th>
							<th title="Коэффициент — во сколько раз оригинал больше отображаемого">Ratio</th>
							<th title="Примерная оценка лишних байт">Лишний вес</th>
						</tr>
					</thead>
					<tbody>
						{images.map((img) => {
							const ratio = (img.naturalWidth * img.naturalHeight)
								/ Math.max(1, img.displayWidth * img.displayHeight);

							return (
								<tr key={img.url}>
									<td style={{ textAlign: 'left' }}>
										<strong className="resource-primary">{getResourceLabel(img.url)}</strong>
										<span className="resource-meta">{getDisplayUrl(img.url, targetOrigin)}</span>
									</td>
									<td>{img.naturalWidth}x{img.naturalHeight}</td>
									<td>{img.displayWidth}x{img.displayHeight}</td>
									<td>{ratio.toFixed(1)}x</td>
									<td>{formatBytes(img.estimatedWastedBytes)}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}
