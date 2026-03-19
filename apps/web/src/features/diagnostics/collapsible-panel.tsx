import { useState } from 'react';

type CollapsiblePanelProps = {
	id: string;
	eyebrow: string;
	title: string;
	hint: string;
	summary: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
};

export function CollapsiblePanel({
	id,
	eyebrow,
	title,
	hint,
	summary,
	defaultOpen = false,
	children,
}: CollapsiblePanelProps)
{
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<section
			className="panel collapsible-panel"
			aria-labelledby={`${id}-heading`}
		>
			<button
				type="button"
				className="collapsible-panel-header"
				aria-expanded={isOpen}
				onClick={() => setIsOpen((prev) => !prev)}
			>
				<span className="collapsible-panel-indicator">
					{isOpen ? '\u25BE' : '\u25B8'}
				</span>
				<span className="collapsible-panel-titles">
					<span className="eyebrow">{eyebrow}</span>
					<span className="collapsible-panel-title" id={`${id}-heading`}>{title}</span>
				</span>
				<span className="collapsible-panel-hint" title={hint}>
					&#9432;
				</span>
				<span className="collapsible-panel-summary workspace-context">
					{summary}
				</span>
			</button>
			{isOpen ? (
				<div className="collapsible-panel-body">
					{children}
				</div>
			) : null}
		</section>
	);
}
