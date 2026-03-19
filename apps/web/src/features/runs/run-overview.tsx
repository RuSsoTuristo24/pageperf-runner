type SummaryItem = {
	label: string;
	value: string;
	tone?: 'default' | 'success' | 'warning';
};

type StageItem = {
	label: string;
	value: string;
	offsetPercent: number;
	gapLabel: string;
	status: 'ready' | 'pending';
};

type DeepMetricItem = {
	label: string;
	value: string;
	hint: string;
};

type RunOverviewProps = {
	summaryItems: SummaryItem[];
	stageItems: StageItem[];
	deepMetricItems: DeepMetricItem[];
	passLabels?: Array<'cold' | 'warm'>;
	selectedPassLabel?: 'cold' | 'warm' | null;
	onPassSelect?: (passLabel: 'cold' | 'warm') => void;
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
	TTFB: 'Время от начала навигации до получения первого байта ответа от сервера.',
	FP: 'Первый пиксель страницы появился на экране.',
	FCP: 'Первый содержательный рендер: текст, изображение, canvas или SVG стали видимыми.',
	LCP: 'Момент, когда отрисовался самый крупный видимый элемент первого экрана.',
	DCL: 'Событие DOMContentLoaded: исходный HTML разобран, DOM готов к работе.',
	LOAD: 'Событие window load: документ и зависимые ресурсы завершили начальную загрузку.',
};

export function RunOverview({
	summaryItems,
	stageItems,
	deepMetricItems,
	passLabels = [],
	selectedPassLabel = null,
	onPassSelect,
}: RunOverviewProps)
{
	return (
		<section className="panel panel-overview" aria-labelledby="overview-heading">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">Итоги прогона</p>
					<h2 id="overview-heading">Обзор прогона</h2>
				</div>
				<p className="panel-kicker">Сетевая нагрузка, размер ресурсов и стадии загрузки.</p>
			</div>

			{passLabels.length > 1 ? (
				<div className="resource-tabs" role="tablist" aria-label="Cache passes">
					{passLabels.map((passLabel) => (
						<button
							key={passLabel}
							type="button"
							role="tab"
							aria-selected={selectedPassLabel === passLabel}
							className={`resource-tab ${selectedPassLabel === passLabel ? 'is-active' : ''}`}
							onClick={() => onPassSelect?.(passLabel)}
						>
							{passLabel === 'cold' ? 'холодный' : passLabel === 'warm' ? 'тёплый' : passLabel}
						</button>
					))}
				</div>
			) : null}

			<div className="summary-grid">
				{summaryItems.map((item) => (
					<article key={item.label} className={`summary-card summary-card-${item.tone ?? 'default'}`}>
						<p className="summary-label">{item.label}</p>
						<p className="summary-value">{item.value}</p>
					</article>
				))}
			</div>

			<div className="stage-panel" aria-labelledby="stages-heading">
				<div className="panel-heading panel-heading-tight">
					<div>
						<p className="eyebrow">Хронология загрузки</p>
						<h3 id="stages-heading">Стадии загрузки</h3>
					</div>
					<p className="panel-kicker">От навигации до полной загрузки</p>
				</div>

				<ol className="stage-list">
					{stageItems.map((stage) => (
						<li key={stage.label} className={`stage-item stage-item-${stage.status}`}>
							<div className="stage-copy">
								<div className="stage-label-row">
									<span className="stage-label">{stage.label}</span>
									<button
										type="button"
										className="stage-hint"
										aria-label={`Что такое ${stage.label}?`}
										title={STAGE_DESCRIPTIONS[stage.label] ?? stage.label}
									>
										?
									</button>
									<span className="stage-gap">{stage.gapLabel}</span>
								</div>
								<strong className="stage-value">{stage.value}</strong>
							</div>
							<div className="stage-rail" aria-hidden="true">
								<span className="stage-bar" style={{ width: `${stage.offsetPercent}%` }} />
							</div>
						</li>
					))}
				</ol>
			</div>

			<div className="deep-metric-grid" aria-label="Детальные метрики производительности">
				{deepMetricItems.map((item) => (
					<article key={item.label} className="summary-card">
						<div className="stage-label-row">
							<p className="summary-label">{item.label}</p>
							<button
								type="button"
								className="stage-hint"
								aria-label={`Что такое ${item.label}?`}
								title={item.hint}
							>
								?
							</button>
						</div>
						<p className="summary-value">{item.value}</p>
					</article>
				))}
			</div>
		</section>
	);
}
