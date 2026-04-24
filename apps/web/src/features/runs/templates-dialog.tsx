import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
	deleteProfileSchedule,
	environmentOptions,
	fetchProfileSchedule,
	putProfileSchedule,
	updateProfile,
	type ApiEnvironment,
	type ApiProfile,
	type ApiRunSchedule,
} from '../../lib/api.js';
import { PagesInput, normalizePagesForSubmit } from './pages-input.js';

type TemplatesDialogProps = {
	profiles: ApiProfile[];
	isOpen: boolean;
	isSubmitting: boolean;
	onClose: () => void;
	onStartExisting: (profileId: string) => void;
	onProfileUpdated: (profile: ApiProfile) => void;
};

type Section = 'params' | 'pages' | 'schedule';

function environmentLabel(env: ApiEnvironment | undefined): string
{
	const hit = environmentOptions.find((option) => option.value === env);
	return hit?.label ?? env ?? '—';
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];

const runSchedulePresets = [
	{ label: 'каждый час', expression: '0 * * * *' },
	{ label: 'каждые 6 часов', expression: '0 */6 * * *' },
	{ label: 'каждый день в 3:00', expression: '0 3 * * *' },
	{ label: 'каждую неделю в пн 3:00', expression: '0 3 * * 1' },
] as const;

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

function formatTimestamp(iso: string | null | undefined): string
{
	if (!iso) return '—';
	try
	{
		return new Date(iso).toLocaleString();
	}
	catch
	{
		return iso;
	}
}

export function TemplatesDialog(props: TemplatesDialogProps)
{
	const [searchQuery, setSearchQuery] = useState('');
	const [pageSize, setPageSize] = useState<PageSize>(20);
	const [page, setPage] = useState(0);
	const [selectedId, setSelectedId] = useState<string>('');
	const [section, setSection] = useState<Section>('params');

	const [environmentDraft, setEnvironmentDraft] = useState<ApiEnvironment>('production');
	const [isSavingEnvironment, setIsSavingEnvironment] = useState(false);
	const [environmentError, setEnvironmentError] = useState<string | null>(null);

	const [pagesDraft, setPagesDraft] = useState('');
	const [isSavingPages, setIsSavingPages] = useState(false);
	const [pagesError, setPagesError] = useState<string | null>(null);

	const [schedule, setSchedule] = useState<ApiRunSchedule | null>(null);
	const [cronExpression, setCronExpression] = useState('0 3 * * *');
	const [enabled, setEnabled] = useState(true);
	const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
	const [isSavingSchedule, setIsSavingSchedule] = useState(false);
	const [scheduleError, setScheduleError] = useState<string | null>(null);

	const templates = useMemo(
		() => props.profiles.filter((profile) => profile.isTemplate),
		[props.profiles],
	);

	const filteredTemplates = useMemo(() =>
	{
		const needle = searchQuery.trim().toLowerCase();
		if (!needle) return templates;
		return templates.filter((profile) =>
			profile.name.toLowerCase().includes(needle)
			|| profile.url.toLowerCase().includes(needle),
		);
	}, [templates, searchQuery]);

	const pageCount = Math.max(1, Math.ceil(filteredTemplates.length / pageSize));
	const safePage = Math.min(page, pageCount - 1);
	const pageSlice = filteredTemplates.slice(safePage * pageSize, (safePage + 1) * pageSize);

	const selectedProfile = useMemo(
		() => templates.find((profile) => profile.id === selectedId) ?? null,
		[templates, selectedId],
	);

	useEffect(() => { setPage(0); }, [searchQuery, pageSize]);

	useEffect(() =>
	{
		// When dialog reopens or selection changes, reset the pages draft and
		// refresh schedule data for the newly-selected profile.
		if (!selectedProfile)
		{
			setPagesDraft('');
			setSchedule(null);
			return;
		}

		setPagesDraft((selectedProfile.pages ?? [selectedProfile.url]).join('\n'));
		setPagesError(null);
		setEnvironmentDraft(selectedProfile.environment);
		setEnvironmentError(null);
	}, [selectedProfile]);

	useEffect(() =>
	{
		if (!selectedProfile)
		{
			return;
		}

		let cancelled = false;
		setIsLoadingSchedule(true);
		setScheduleError(null);
		fetchProfileSchedule(selectedProfile.id)
			.then((result) =>
			{
				if (cancelled) return;
				setSchedule(result);
				setCronExpression(result?.cronExpression ?? '0 3 * * *');
				setEnabled(result?.enabled ?? true);
			})
			.catch((err) =>
			{
				if (!cancelled) setScheduleError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => { if (!cancelled) setIsLoadingSchedule(false); });

		return () => { cancelled = true; };
	}, [selectedProfile]);

	useEffect(() =>
	{
		if (!props.isOpen) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		function onKey(event: KeyboardEvent): void
		{
			if (event.key === 'Escape') props.onClose();
		}
		document.addEventListener('keydown', onKey);

		return () =>
		{
			document.body.style.overflow = previousOverflow;
			document.removeEventListener('keydown', onKey);
		};
	}, [props.isOpen, props.onClose]);

	async function handleSaveEnvironment(): Promise<void>
	{
		if (!selectedProfile) return;

		setIsSavingEnvironment(true);
		setEnvironmentError(null);
		try
		{
			const updated = await updateProfile(selectedProfile.id, { environment: environmentDraft });
			props.onProfileUpdated(updated);
		}
		catch (err)
		{
			setEnvironmentError(err instanceof Error ? err.message : String(err));
		}
		finally
		{
			setIsSavingEnvironment(false);
		}
	}

	async function handleSavePages(): Promise<void>
	{
		if (!selectedProfile) return;

		setIsSavingPages(true);
		setPagesError(null);
		try
		{
			const pages = normalizePagesForSubmit(pagesDraft, selectedProfile.url);
			const updated = await updateProfile(selectedProfile.id, {
				pages: pages.length ? pages : [selectedProfile.url],
			});
			props.onProfileUpdated(updated);
		}
		catch (err)
		{
			setPagesError(err instanceof Error ? err.message : String(err));
		}
		finally
		{
			setIsSavingPages(false);
		}
	}

	async function handleSaveSchedule(): Promise<void>
	{
		if (!selectedProfile) return;

		setIsSavingSchedule(true);
		setScheduleError(null);
		try
		{
			const saved = await putProfileSchedule(selectedProfile.id, {
				cronExpression: cronExpression.trim(),
				enabled,
			});
			setSchedule(saved);
		}
		catch (err)
		{
			setScheduleError(err instanceof Error ? err.message : String(err));
		}
		finally
		{
			setIsSavingSchedule(false);
		}
	}

	async function handleDeleteSchedule(): Promise<void>
	{
		if (!selectedProfile) return;

		setIsSavingSchedule(true);
		setScheduleError(null);
		try
		{
			await deleteProfileSchedule(selectedProfile.id);
			setSchedule(null);
			setCronExpression('0 3 * * *');
			setEnabled(true);
		}
		catch (err)
		{
			setScheduleError(err instanceof Error ? err.message : String(err));
		}
		finally
		{
			setIsSavingSchedule(false);
		}
	}

	function handleStart(): void
	{
		if (!selectedProfile) return;
		props.onStartExisting(selectedProfile.id);
		props.onClose();
	}

	if (!props.isOpen || typeof document === 'undefined')
	{
		return null;
	}

	return createPortal(
		<div
			className="pages-input-modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-label="Шаблоны прогонов"
			onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}
		>
			<div className="pages-input-modal templates-dialog">
				<header className="pages-input-modal-header templates-dialog-header">
					<div>
						<h3>Шаблоны</h3>
						<p>{templates.length} всего{filteredTemplates.length !== templates.length ? `, отфильтровано ${filteredTemplates.length}` : ''}</p>
					</div>
					<button
						type="button"
						className="secondary-button secondary-button-compact profile-settings-close"
						onClick={props.onClose}
						aria-label="Закрыть"
					>
						×
					</button>
				</header>

				<div className="templates-dialog-body">
					<aside className="templates-dialog-list-pane">
						<label className="field templates-dialog-search">
							<span>Поиск</span>
							<input
								aria-label="Поиск шаблона"
								type="search"
								placeholder="имя или URL"
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
							/>
						</label>

						{filteredTemplates.length === 0 ? (
							<p className="template-empty">— ничего не найдено —</p>
						) : (
							<ul
								className="template-list templates-dialog-list"
								role="listbox"
								aria-label="Список шаблонов"
							>
								{pageSlice.map((profile) => (
									<li key={profile.id}>
										<button
											type="button"
											role="option"
											aria-selected={selectedId === profile.id}
											className={`template-list-item${selectedId === profile.id ? ' is-selected' : ''}`}
											onClick={() => setSelectedId(profile.id)}
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

						{filteredTemplates.length > 0 ? (
							<div className="templates-dialog-pagination">
								<label className="pagination-page-size">
									<span>На странице</span>
									<select
										aria-label="Количество шаблонов на странице"
										value={pageSize}
										onChange={(event) => setPageSize(Number(event.target.value) as PageSize)}
									>
										{PAGE_SIZE_OPTIONS.map((size) => (
											<option key={size} value={size}>{size}</option>
										))}
									</select>
								</label>
								<p className="pagination-summary">
									{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filteredTemplates.length)} из {filteredTemplates.length}
								</p>
								<div className="pagination-controls">
									<button
										type="button"
										className="secondary-button secondary-button-compact"
										disabled={safePage === 0}
										onClick={() => setPage(safePage - 1)}
									>
										←
									</button>
									<span className="pagination-page-indicator">{safePage + 1}/{pageCount}</span>
									<button
										type="button"
										className="secondary-button secondary-button-compact"
										disabled={safePage >= pageCount - 1}
										onClick={() => setPage(safePage + 1)}
									>
										→
									</button>
								</div>
							</div>
						) : null}
					</aside>

					<section className="templates-dialog-detail-pane">
						{!selectedProfile ? (
							<div className="templates-dialog-empty">
								<p>Выберите шаблон слева для запуска или настройки.</p>
							</div>
						) : (
							<>
								<header className="templates-dialog-detail-header">
									<div>
										<h4>{selectedProfile.name}</h4>
										<p title={selectedProfile.url}>{selectedProfile.url}</p>
										<p className="templates-dialog-detail-meta">
											{environmentLabel(selectedProfile.environment)}
											{' · '}
											{selectedProfile.throttling} / {selectedProfile.cacheMode}
											{selectedProfile.authMode === 'session' ? ' · сохранённая сессия' : ''}
										</p>
									</div>
									<button
										type="button"
										className="primary-button primary-button-inline"
										onClick={handleStart}
										disabled={props.isSubmitting}
									>
										{props.isSubmitting ? 'Запуск…' : 'Запустить'}
									</button>
								</header>

								<nav className="profile-settings-tabs" role="tablist">
									<button
										type="button"
										role="tab"
										aria-selected={section === 'params'}
										className={`profile-settings-tab${section === 'params' ? ' is-active' : ''}`}
										onClick={() => setSection('params')}
									>
										Параметры
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={section === 'pages'}
										className={`profile-settings-tab${section === 'pages' ? ' is-active' : ''}`}
										onClick={() => setSection('pages')}
									>
										Страницы
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={section === 'schedule'}
										className={`profile-settings-tab${section === 'schedule' ? ' is-active' : ''}`}
										onClick={() => setSection('schedule')}
									>
										Расписание запусков
									</button>
								</nav>

								<div className="templates-dialog-detail-body">
									{section === 'params' ? (
										<div className="profile-settings-section">
											<label className="field">
												<span>Среда тестирования</span>
												<select
													aria-label="Среда тестирования"
													value={environmentDraft}
													onChange={(event) => setEnvironmentDraft(event.target.value as ApiEnvironment)}
												>
													{environmentOptions.map((option) => (
														<option key={option.value} value={option.value}>{option.label}</option>
													))}
												</select>
												<span className="field-hint">Среда, к которой шаблон относится. В Grafana можно фильтровать и сравнивать между средами.</span>
											</label>

											{environmentError ? <p className="error-banner">{environmentError}</p> : null}

											<div className="profile-settings-section-actions">
												<button
													type="button"
													className="primary-button"
													onClick={handleSaveEnvironment}
													disabled={isSavingEnvironment || environmentDraft === selectedProfile.environment}
												>
													{isSavingEnvironment ? 'Сохранение…' : 'Сохранить параметры'}
												</button>
											</div>
										</div>
									) : null}

									{section === 'pages' ? (
										<div className="profile-settings-section">
											<PagesInput
												value={pagesDraft}
												profileUrl={selectedProfile.url}
												onChange={setPagesDraft}
											/>
											{pagesError ? <p className="error-banner">{pagesError}</p> : null}
											<div className="profile-settings-section-actions">
												<button
													type="button"
													className="primary-button"
													onClick={handleSavePages}
													disabled={isSavingPages}
												>
													{isSavingPages ? 'Сохранение…' : 'Сохранить страницы'}
												</button>
											</div>
										</div>
									) : null}

									{section === 'schedule' ? (
										<div className="profile-settings-section">
											{isLoadingSchedule ? <p className="message-banner">Загрузка…</p> : null}

											<label className="field">
												<span>Cron-выражение</span>
												<input
													aria-label="Cron-выражение"
													type="text"
													className="run-schedule-cron-input"
													value={cronExpression}
													onChange={(event) => setCronExpression(event.target.value)}
													placeholder="0 3 * * *"
													spellCheck={false}
												/>
												<span className="field-hint">Формат: мин час день месяц день_недели. Пример: <code>0 3 * * *</code> — каждый день в 3:00.</span>
											</label>

											<div className="run-schedule-presets">
												<p className="eyebrow">Пресеты</p>
												<div className="run-schedule-preset-buttons">
													{runSchedulePresets.map((preset) => (
														<button
															key={preset.expression}
															type="button"
															className={`run-schedule-preset-button${cronExpression === preset.expression ? ' is-active' : ''}`}
															onClick={() => setCronExpression(preset.expression)}
														>
															<span className="run-schedule-preset-label">{preset.label}</span>
															<code>{preset.expression}</code>
														</button>
													))}
												</div>
											</div>

											<label className="field-checkbox">
												<input
													aria-label="Расписание включено"
													type="checkbox"
													checked={enabled}
													onChange={(event) => setEnabled(event.target.checked)}
												/>
												<span>Включено</span>
											</label>

											{schedule ? (
												<dl className="run-schedule-meta">
													<div>
														<dt>Последний запуск</dt>
														<dd>{formatTimestamp(schedule.lastTriggeredAt)}</dd>
													</div>
													<div>
														<dt>Последний run</dt>
														<dd>{schedule.lastRunId ? <code>{schedule.lastRunId.slice(0, 8)}…</code> : '—'}</dd>
													</div>
												</dl>
											) : null}

											{scheduleError ? <p className="error-banner">{scheduleError}</p> : null}

											<div className="profile-settings-section-actions profile-settings-section-actions-split">
												{schedule ? (
													<button
														type="button"
														className="secondary-button"
														onClick={handleDeleteSchedule}
														disabled={isSavingSchedule}
													>
														Удалить расписание
													</button>
												) : <span />}
												<button
													type="button"
													className="primary-button"
													onClick={handleSaveSchedule}
													disabled={isSavingSchedule || !cronExpression.trim()}
												>
													{isSavingSchedule ? 'Сохранение…' : 'Сохранить расписание'}
												</button>
											</div>
										</div>
									) : null}
								</div>
							</>
						)}
					</section>
				</div>
			</div>
		</div>,
		document.body,
	);
}
