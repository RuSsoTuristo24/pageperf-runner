import { useMemo, useState } from 'react';

import type { ApiProfile } from '../../lib/api.js';
import { ProfileSettingsDialog } from './profile-settings-dialog.js';

type RunTemplatesListProps = {
	profiles: ApiProfile[];
	isSubmitting: boolean;
	onStartExisting: (profileId: string) => void;
	onProfileUpdated?: (profile: ApiProfile) => void;
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
	const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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

	const selectedProfile = useMemo(
		() => templates.find((profile) => profile.id === selectedProfileId) ?? null,
		[templates, selectedProfileId],
	);

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

			<div className="field">
				<span>Профиль</span>
				{filteredTemplates.length === 0 ? (
					<p className="template-empty">— ничего не найдено —</p>
				) : (
					<ul
						className="template-list"
						role="listbox"
						aria-label="Выбрать профиль"
					>
						{filteredTemplates.map((profile) => (
							<li key={profile.id}>
								<button
									type="button"
									role="option"
									aria-selected={selectedProfileId === profile.id}
									className={`template-list-item${selectedProfileId === profile.id ? ' is-selected' : ''}`}
									onClick={() => setSelectedProfileId(profile.id)}
									title={`${profile.name} · ${profile.url}`}
								>
									<strong className="template-list-name">{profile.name}</strong>
									<span className="template-list-url">{formatHint(profile.url)}</span>
									<span className="template-list-meta">{profile.throttling} / {profile.cacheMode}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

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
				onClick={() => setIsSettingsOpen(true)}
				disabled={!selectedProfileId}
			>
				Настройки шаблона
			</button>
			{!selectedProfileId ? (
				<p className="run-templates-hint">Сначала выберите шаблон в списке выше</p>
			) : null}

			<ProfileSettingsDialog
				profile={selectedProfile}
				isOpen={isSettingsOpen && !!selectedProfile}
				onClose={() => setIsSettingsOpen(false)}
				onProfileUpdated={props.onProfileUpdated}
			/>
		</section>
	);
}
