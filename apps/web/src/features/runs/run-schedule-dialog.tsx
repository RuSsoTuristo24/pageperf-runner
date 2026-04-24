import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
	deleteProfileSchedule,
	fetchProfileSchedule,
	putProfileSchedule,
	type ApiRunSchedule,
} from '../../lib/api.js';

const runSchedulePresets = [
	{ label: 'каждый час', expression: '0 * * * *' },
	{ label: 'каждые 6 часов', expression: '0 */6 * * *' },
	{ label: 'каждый день в 3:00', expression: '0 3 * * *' },
	{ label: 'каждую неделю в пн 3:00', expression: '0 3 * * 1' },
] as const;

type RunScheduleDialogProps = {
	profileId: string;
	profileName: string;
	isOpen: boolean;
	onClose: () => void;
	onSaved?: (schedule: ApiRunSchedule | null) => void;
};

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

export function RunScheduleDialog(props: RunScheduleDialogProps)
{
	const [schedule, setSchedule] = useState<ApiRunSchedule | null>(null);
	const [cronExpression, setCronExpression] = useState('');
	const [enabled, setEnabled] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() =>
	{
		if (!props.isOpen) return;

		let cancelled = false;
		setIsLoading(true);
		setError(null);
		fetchProfileSchedule(props.profileId)
			.then((result) =>
			{
				if (cancelled) return;
				setSchedule(result);
				setCronExpression(result?.cronExpression ?? '0 3 * * *');
				setEnabled(result?.enabled ?? true);
			})
			.catch((err) =>
			{
				if (!cancelled) setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => { if (!cancelled) setIsLoading(false); });

		return () => { cancelled = true; };
	}, [props.isOpen, props.profileId]);

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

	async function handleSave(): Promise<void>
	{
		setIsSaving(true);
		setError(null);
		try
		{
			const saved = await putProfileSchedule(props.profileId, {
				cronExpression: cronExpression.trim(),
				enabled,
			});
			setSchedule(saved);
			props.onSaved?.(saved);
			props.onClose();
		}
		catch (err)
		{
			setError(err instanceof Error ? err.message : String(err));
		}
		finally
		{
			setIsSaving(false);
		}
	}

	async function handleDelete(): Promise<void>
	{
		setIsSaving(true);
		setError(null);
		try
		{
			await deleteProfileSchedule(props.profileId);
			setSchedule(null);
			props.onSaved?.(null);
			props.onClose();
		}
		catch (err)
		{
			setError(err instanceof Error ? err.message : String(err));
		}
		finally
		{
			setIsSaving(false);
		}
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
			aria-label="Настройка расписания прогонов"
			onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}
		>
			<div className="pages-input-modal run-schedule-modal">
				<header className="pages-input-modal-header">
					<h3>Расписание прогонов</h3>
					<p>{props.profileName}</p>
				</header>

				<div className="pages-input-modal-body run-schedule-body">
					{isLoading ? <p className="message-banner">Загрузка…</p> : null}

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

					{error ? <p className="error-banner">{error}</p> : null}
				</div>

				<footer className="pages-input-modal-footer run-schedule-footer">
					{schedule ? (
						<button
							type="button"
							className="secondary-button"
							onClick={handleDelete}
							disabled={isSaving}
						>
							Удалить
						</button>
					) : <span />}
					<div className="run-schedule-footer-right">
						<button type="button" className="secondary-button" onClick={props.onClose} disabled={isSaving}>
							Отмена
						</button>
						<button type="button" className="primary-button" onClick={handleSave} disabled={isSaving || !cronExpression.trim()}>
							{isSaving ? 'Сохранение…' : 'Сохранить'}
						</button>
					</div>
				</footer>
			</div>
		</div>,
		document.body,
	);
}
