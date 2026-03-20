import type { ApiRunDetails } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getTargetOrigin } from '../../lib/url.js';

type OversizedImage = NonNullable<ApiRunDetails['pageDiagnostics']>['oversizedImages'][number];

type OversizedImagesPanelProps = {
	images?: OversizedImage[];
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
							<th style={{ textAlign: 'left' }} title="URL изображения на странице">Изображение</th>
							<th title="Реальный размер файла изображения (naturalWidth × naturalHeight)">Оригинал</th>
							<th title="Размер отображения на странице (clientWidth × clientHeight)">Отображение</th>
							<th title="Рекомендуемый размер с учётом Device Pixel Ratio (display × DPR). Такой размер сохранит чёткость на текущем экране без лишних пикселей.">Рекомендуемый</th>
							<th title="Формат файла. Разные форматы имеют разный вес на пиксель: PNG ~1.0, JPEG ~0.3, WebP ~0.15, AVIF ~0.1">Формат</th>
							<th title="Примерная оценка лишнего трафика. Рассчитывается как (лишние пиксели × коэффициент формата). Коэфф.: PNG ~1.0, JPEG ~0.3, WebP ~0.15">Лишний вес</th>
						</tr>
					</thead>
					<tbody>
						{images.map((img) => {
							const ratio = (img.naturalWidth * img.naturalHeight)
								/ Math.max(1, img.displayWidth * img.displayHeight);
							const recW = img.recommendedWidth ?? Math.round(img.displayWidth * (img.dpr ?? 2));
							const recH = img.recommendedHeight ?? Math.round(img.displayHeight * (img.dpr ?? 2));

							return (
								<tr key={img.url}>
									<td style={{ textAlign: 'left' }}>
										<strong className="resource-primary">{getResourceLabel(img.url)}</strong>
										<span className="resource-meta">{getDisplayUrl(img.url, targetOrigin)}</span>
										{img.hasSrcset ? (
											<span className="oversized-badge oversized-srcset" title="Используется srcset или <picture>. Браузер уже выбирает вариант, но текущий всё равно oversized.">srcset</span>
										) : null}
									</td>
									<td>{img.naturalWidth}×{img.naturalHeight}</td>
									<td>
										{img.displayWidth}×{img.displayHeight}
										{img.dpr && img.dpr !== 1 ? (
											<span className="oversized-dpr" title={`Device Pixel Ratio: ${img.dpr}. Для чёткости на этом экране нужен размер display × ${img.dpr}`}>
												@{img.dpr}x
											</span>
										) : null}
									</td>
									<td title={`Идеальный размер: ${recW}×${recH} (display × DPR). Уменьшите исходник до этого размера.`}>
										{recW}×{recH}
									</td>
									<td>
										{img.format ? (
											<span className="table-pill">{img.format}</span>
										) : '—'}
									</td>
									<td>
										<span title={`${ratio.toFixed(1)}× oversized`}>
											{formatBytes(img.estimatedWastedBytes)}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}
