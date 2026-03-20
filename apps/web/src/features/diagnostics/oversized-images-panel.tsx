import type { ApiRunDetails, ApiImageCoefficients } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getTargetOrigin } from '../../lib/url.js';

type OversizedImage = NonNullable<ApiRunDetails['pageDiagnostics']>['oversizedImages'][number];

type OversizedImagesPanelProps = {
	images?: OversizedImage[];
	targetUrl?: string;
	imageCoefficients?: ApiImageCoefficients;
};

const DEFAULT_COEFFICIENTS: ApiImageCoefficients = {
	png: 1.0,
	jpg: 0.3,
	gif: 0.5,
	webp: 0.15,
	avif: 0.1,
	other: 0.3,
};

function getCoefficient(format: string | undefined, coefficients: ApiImageCoefficients): number
{
	if (!format)
	{
		return coefficients.other;
	}

	const key = format === 'jpeg' ? 'jpg' : format;

	return (coefficients as Record<string, number>)[key] ?? coefficients.other;
}

function calcWastedBytes(img: OversizedImage, coefficients: ApiImageCoefficients): number
{
	if (img.wastedPixels && img.format)
	{
		return Math.round(img.wastedPixels * getCoefficient(img.format, coefficients));
	}

	return img.estimatedWastedBytes;
}

export function OversizedImagesPanel({ images, targetUrl, imageCoefficients }: OversizedImagesPanelProps)
{
	if (!images || images.length === 0)
	{
		return null;
	}

	const coefficients = imageCoefficients ?? DEFAULT_COEFFICIENTS;
	const targetOrigin = getTargetOrigin(targetUrl);
	const totalWasted = images.reduce((sum, img) => sum + calcWastedBytes(img, coefficients), 0);

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
							<th title="Реальный размер файла изображения (naturalWidth x naturalHeight)">Оригинал</th>
							<th title="Размер отображения на странице (clientWidth x clientHeight)">Отображение</th>
							<th title="Рекомендуемый размер с учётом Device Pixel Ratio. Такой размер сохранит чёткость на текущем экране без лишних пикселей.">Рекомендуемый</th>
							<th title="Формат файла. Коэффициент byte/px настраивается в Settings.">Формат</th>
							<th title="Лишний вес = лишние пиксели x коэффициент формата. Коэффициенты настраиваются через шестерёнку в заголовке.">Лишний вес</th>
						</tr>
					</thead>
					<tbody>
						{images.map((img) => {
							const recW = img.recommendedWidth ?? Math.round(img.displayWidth * (img.dpr ?? 2));
							const recH = img.recommendedHeight ?? Math.round(img.displayHeight * (img.dpr ?? 2));
							const wasted = calcWastedBytes(img, coefficients);
							const coeff = getCoefficient(img.format, coefficients);

							return (
								<tr key={img.url}>
									<td style={{ textAlign: 'left' }}>
										<strong className="resource-primary">{getResourceLabel(img.url)}</strong>
										<span className="resource-meta">{getDisplayUrl(img.url, targetOrigin)}</span>
										{img.hasSrcset ? (
											<span className="oversized-badge oversized-srcset" title="Используется srcset или <picture>. Браузер уже выбирает вариант, но текущий всё равно oversized.">srcset</span>
										) : null}
									</td>
									<td>{img.naturalWidth}x{img.naturalHeight}</td>
									<td>
										{img.displayWidth}x{img.displayHeight}
										{img.dpr && img.dpr !== 1 ? (
											<span className="oversized-dpr" title={`Device Pixel Ratio: ${img.dpr}`}>
												@{img.dpr}x
											</span>
										) : null}
									</td>
									<td title={`Идеальный размер: ${recW}x${recH} (display x DPR)`}>
										{recW}x{recH}
									</td>
									<td>
										{img.format ? (
											<span className="table-pill" title={`Коэфф. ${coeff} byte/px`}>{img.format}</span>
										) : '—'}
									</td>
									<td title={`${img.wastedPixels?.toLocaleString() ?? '?'} лишних px x ${coeff} byte/px`}>
										{formatBytes(wasted)}
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
