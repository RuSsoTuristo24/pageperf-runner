type DeltaItem = {
	label: string;
	value: string;
};

type CompareViewProps = {
	deltas: DeltaItem[];
};

export function CompareView({ deltas }: CompareViewProps)
{
	return (
		<section className="panel panel-compare" aria-labelledby="compare-heading">
			<div className="panel-heading panel-heading-inline">
				<div>
					<p className="eyebrow">Regression Watch</p>
					<h2 id="compare-heading">Compare Runs</h2>
				</div>
				<p className="panel-kicker">Baseline mode is next. This panel will hold deltas once compare is enabled.</p>
			</div>

			{deltas.length === 0 ? (
				<p className="empty-copy">No baseline comparison yet.</p>
			) : (
				<ul className="delta-list">
					{deltas.map((delta) => (
						<li key={delta.label}>
							<strong>{delta.label}</strong>
							<span>{delta.value}</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
