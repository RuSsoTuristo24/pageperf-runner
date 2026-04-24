import { useMemo, useState } from 'react';

import type { ApiProfile } from '../../lib/api.js';
import { TemplatesDialog } from './templates-dialog.js';

type RunTemplatesListProps = {
	profiles: ApiProfile[];
	isSubmitting: boolean;
	onStartExisting: (profileId: string) => void;
	onProfileUpdated?: (profile: ApiProfile) => void;
};

export function RunTemplatesList(props: RunTemplatesListProps)
{
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const templates = useMemo(
		() => props.profiles.filter((profile) => profile.isTemplate),
		[props.profiles],
	);

	if (templates.length === 0)
	{
		return null;
	}

	return (
		<section className="sidebar-section sidebar-section-templates" aria-labelledby="templates-heading">
			<div className="sidebar-section-heading">
				<div>
					<p className="eyebrow">Шаблоны</p>
					<h2 id="templates-heading">Запустить по шаблону</h2>
				</div>
			</div>

			<p className="sidebar-copy">
				Новый прогон по сохранённому профилю: выбор, запуск и настройки — в одном окне.
			</p>

			<button
				type="button"
				className="primary-button"
				onClick={() => setIsDialogOpen(true)}
			>
				Открыть список ({templates.length})
			</button>

			<TemplatesDialog
				profiles={props.profiles}
				isOpen={isDialogOpen}
				isSubmitting={props.isSubmitting}
				onClose={() => setIsDialogOpen(false)}
				onStartExisting={props.onStartExisting}
				onProfileUpdated={(profile) => props.onProfileUpdated?.(profile)}
			/>
		</section>
	);
}
