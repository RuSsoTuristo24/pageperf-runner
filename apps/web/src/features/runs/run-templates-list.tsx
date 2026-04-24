import { useMemo, useState } from 'react';

import type { ApiProfile } from '../../lib/api.js';
import { RunScheduleDialog } from './run-schedule-dialog.js';

type RunTemplatesListProps = {
	profiles: ApiProfile[];
	isSubmitting: boolean;
	onStartExisting: (profileId: string) => void;
};

function formatHint(url: string): string
{
	try
	{
		const parsed = new URL(url);
		return parsed.host + (parsed.pathname !== '/' ? parsed.pathname : '');
	}
	catch
	{
		return url;
	}
}

export function RunTemplatesList(props: RunTemplatesListProps)
{
	const [selectedProfileId, setSelectedProfileId] = useState<string>('');
	const [filter, setFilter] = useState<string>('');
	const [isScheduleOpen, setIsScheduleOpen] = useState<boolean>(false);

	const templates = useMemo(
		() => props.profiles.filter((profile) => profile.isTemplate),
		[props.profiles],
	);

	const filteredTemplates = useMemo(() =>
	{
		const needle = filter.trim().toLowerCase();
		if (!needle)
		{
			return templates;
		}
		return templates.filter((profile) =>
			profile.name.toLowerCase().includes(needle)
			|| profile.url.toLowerCase().includes(needle),
		);
	}, [templates, filter]);

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

	const showFilter = templates.length > 5;

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

			{showFilter ? (
				<label className="field">
					<span>Поиск</span>
					<input
						aria-label="Поиск шаблона"
						type="search"
						placeholder="имя или URL"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
					/>
				</label>
			) : null}

			<label className="field">
				<span>Профиль</span>
				<select
					aria-label="Выбрать профиль"
					size={Math.min(Math.max(filteredTemplates.length, 3), 8)}
					value={selectedProfileId}
					onChange={(event) => setSelectedProfileId(event.target.value)}
				>
					{filteredTemplates.length === 0 ? (
						<option value="" disabled>— ничего не найдено —</option>
					) : (
						filteredTemplates.map((profile) => (
							<option key={profile.id} value={profile.id} title={`${profile.name} · ${profile.url}`}>
								{profile.name} — {formatHint(profile.url)} ({profile.throttling} / {profile.cacheMode})
							</option>
						))
					)}
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

			<button
				type="button"
				className="secondary-button run-templates-schedule-button"
				onClick={() => setIsScheduleOpen(true)}
				disabled={!selectedProfileId}
			>
				Расписание
			</button>

			{selectedProfileId ? (
				<RunScheduleDialog
					profileId={selectedProfileId}
					profileName={templates.find((profile) => profile.id === selectedProfileId)?.name ?? ''}
					isOpen={isScheduleOpen}
					onClose={() => setIsScheduleOpen(false)}
				/>
			) : null}
		</section>
	);
}
