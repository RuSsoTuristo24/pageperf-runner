import { useState } from 'react';

import type { ApiProfile } from '../../lib/api.js';

type RunTemplatesListProps = {
	profiles: ApiProfile[];
	isSubmitting: boolean;
	onStartExisting: (profileId: string) => void;
};

export function RunTemplatesList(props: RunTemplatesListProps)
{
	const [selectedProfileId, setSelectedProfileId] = useState<string>('');

	const templates = props.profiles.filter((profile) => profile.isTemplate);

	if (templates.length === 0)
	{
		return null;
	}

	function handleStart(): void
	{
		if (!selectedProfileId)
		{
			return;
		}

		props.onStartExisting(selectedProfileId);
	}

	return (
		<section className="sidebar-section sidebar-section-templates" aria-labelledby="templates-heading">
			<div className="sidebar-section-heading">
				<div>
					<p className="eyebrow">Шаблоны</p>
					<h2 id="templates-heading">Запустить по профилю</h2>
				</div>
			</div>

			<p className="sidebar-copy">
				Новый прогон по сохранённому профилю — без заполнения формы.
			</p>

			<label className="field">
				<span>Профиль</span>
				<select
					aria-label="Выбрать профиль"
					value={selectedProfileId}
					onChange={(event) => setSelectedProfileId(event.target.value)}
				>
					<option value="">— выберите профиль —</option>
					{templates.map((profile) => (
						<option key={profile.id} value={profile.id}>
							{profile.name} ({profile.throttling} / {profile.cacheMode})
						</option>
					))}
				</select>
			</label>

			<button
				type="button"
				className="primary-button"
				onClick={handleStart}
				disabled={props.isSubmitting || !selectedProfileId}
			>
				{props.isSubmitting ? 'Запуск…' : 'Запустить'}
			</button>
		</section>
	);
}
