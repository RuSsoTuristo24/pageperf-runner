import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
	deleteProfileSchedule,
	fetchProfileSchedule,
	putProfileSchedule,
	updateProfile,
	type ApiProfile,
	type ApiRunSchedule,
} from '../../lib/api.js';
import { PagesInput, normalizePagesForSubmit } from './pages-input.js';

type ProfileSettingsDialogProps = {
	profile: ApiProfile | null;
	isOpen: boolean;
	onClose: () => void;
	onProfileUpdated?: (profile: ApiProfile) => void;
};

type Section = 'pages' | 'schedule';

const runSchedulePresets = [
	{ label: 'каждый час', expression: '0 * * * *' },
	{ label: 'каждые 6 часов', expression: '0 */6 * * *' },
	{ label: 'каждый день в 3:00', expression: '0 3 * * *' },
	{ label: 'каждую неделю в пн 3:00', expression: '0 3 * * 1' },
] as const;

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

export function ProfileSettingsDialog(props: ProfileSettingsDialogProps)
{
	const [section, setSection] = useState<Section>('pages');
	const [pagesDraft, setPagesDraft] = useState('');
	const [isSavingPages, setIsSavingPages] = useState(false);
	const [pagesError, setPagesError] = useState<string | null>(null);

	const [schedule, setSchedule] = useState<ApiRunSchedule | null>(null);
	const [cronExpression, setCronExpression] = useState('0 3 * * *');
	const [enabled, setEnabled] = useState(true);
	const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
	const [isSavingSchedule, setIsSavingSchedule] = useState(false);
	const [scheduleError, setScheduleError] = useState<string | null>(null);

	const profile = props.profile;
	const profileOrigin = useMemo(() => profile?.url ?? '', [profile]);

	useEffect(() =>
	{
		if (!props.isOpen || !profile)
		{
			return;
		}

		const initialPages = (profile.pages ?? [profile.url]).join('\n');
		setPagesDraft(initialPages);
		setPagesError(null);
	}, [props.isOpen, profile]);

	useEffect(() =>
	{
		if (!props.isOpen || !profile)
		{
			return;
		}

		let cancelled = false;
		setIsLoadingSchedule(true);
		setScheduleError(null);
		fetchProfileSchedule(profile.id)
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
	}, [props.isOpen, profile]);

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

	async function handleSavePages(): Promise<void>
	{
		if (!profile) return;

		setIsSavingPages(true);
		setPagesError(null);
		try
		{
			const pages = normalizePagesForSubmit(pagesDraft, profile.url);
			const updated = await updateProfile(profile.id, { pages: pages.length ? pages : [profile.url] });
			props.onProfileUpdated?.(updated);
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
		if (!profile) return;

		setIsSavingSchedule(true);
		setScheduleError(null);
		try
		{
			const saved = await putProfileSchedule(profile.id, {
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
		if (!profile) return;

		setIsSavingSchedule(true);
		setScheduleError(null);
		try
		{
			await deleteProfileSchedule(profile.id);
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

	if (!props.isOpen || !profile || typeof document === 'undefined')
	{
		return null;
	}

	return createPortal(
		<div
			className="pages-input-modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-label="Настройки шаблона"
			onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}
		>
			<div className="pages-input-modal profile-settings-modal">
				<header className="pages-input-modal-header profile-settings-header">
					<div>
						<h3>Настройки шаблона</h3>
						<p title={profile.url}>{profile.name} · {profile.url}</p>
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

				<nav className="profile-settings-tabs" role="tablist">
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

				<div className="pages-input-modal-body profile-settings-body">
					{section === 'pages' ? (
						<div className="profile-settings-section">
							<PagesInput
								value={pagesDraft}
								profileUrl={profileOrigin}
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
			</div>
		</div>,
		document.body,
	);
}
