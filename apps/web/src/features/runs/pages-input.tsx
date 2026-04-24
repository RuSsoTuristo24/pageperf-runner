import { useMemo, useState } from 'react';

type PagesInputProps = {
	value: string;
	profileUrl: string;
	onChange: (value: string) => void;
};

const PREVIEW_LIMIT = 4;

function parseLines(raw: string): string[]
{
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function originOf(profileUrl: string): string | null
{
	try
	{
		return new URL(profileUrl).origin;
	}
	catch
	{
		return null;
	}
}

function toPreviewLabel(line: string, profileOrigin: string | null): string
{
	if (/^https?:\/\//i.test(line))
	{
		try
		{
			const parsed = new URL(line);

			if (profileOrigin && parsed.origin === profileOrigin)
			{
				return (parsed.pathname + parsed.search) || '/';
			}

			return parsed.host + parsed.pathname + parsed.search;
		}
		catch
		{
			return line;
		}
	}

	return line.startsWith('/') ? line : '/' + line;
}

export function PagesInput(props: PagesInputProps)
{
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(props.value);

	const lines = useMemo(() => parseLines(props.value), [props.value]);
	const profileOrigin = useMemo(() => originOf(props.profileUrl), [props.profileUrl]);
	const previewItems = lines.slice(0, PREVIEW_LIMIT);
	const hiddenCount = lines.length - previewItems.length;

	function openEditor(): void
	{
		setDraft(props.value);
		setIsEditing(true);
	}

	function cancelEditor(): void
	{
		setIsEditing(false);
	}

	function applyEditor(): void
	{
		const cleaned = parseLines(draft).join('\n');

		props.onChange(cleaned);
		setIsEditing(false);
	}

	const draftLines = useMemo(() => parseLines(draft), [draft]);

	return (
		<div className="field pages-input">
			<span>Страницы для прогона</span>

			{lines.length === 0 ? (
				<button
					type="button"
					className="pages-input-empty"
					onClick={openEditor}
				>
					Нажмите чтобы добавить страницы
				</button>
			) : (
				<button
					type="button"
					className="pages-input-preview"
					onClick={openEditor}
					aria-label="Редактировать список страниц"
				>
					<ol className="pages-input-preview-list">
						{previewItems.map((line, index) => (
							<li key={`${index}-${line}`}>
								<span className="pages-input-num">{index + 1}</span>
								<span className="pages-input-label" title={line}>
									{toPreviewLabel(line, profileOrigin)}
								</span>
							</li>
						))}
					</ol>
					{hiddenCount > 0 ? (
						<p className="pages-input-more">ещё {hiddenCount}</p>
					) : null}
					<p className="pages-input-edit-hint">Нажмите чтобы изменить</p>
				</button>
			)}

			<span className="field-hint">По одному URL на строку. Можно относительный путь (/crm/lead/list/) или полный (https://…/crm/lead/list/).</span>

			{isEditing ? (
				<div
					className="pages-input-modal-backdrop"
					role="dialog"
					aria-modal="true"
					aria-label="Редактирование списка страниц"
					onClick={(event) => { if (event.target === event.currentTarget) cancelEditor(); }}
				>
					<div className="pages-input-modal">
						<header className="pages-input-modal-header">
							<h3>Страницы для прогона</h3>
							<p>{draftLines.length} {pluralPages(draftLines.length)}</p>
						</header>

						<div className="pages-input-modal-body">
							<textarea
								aria-label="Список страниц"
								className="pages-input-textarea"
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								placeholder={'/crm/lead/list/\n/blank.php\nhttps://russeltest.bitrix24.ru/crm/deal/kanban/'}
								autoFocus
								spellCheck={false}
							/>

							{draftLines.length > 0 ? (
								<ol className="pages-input-modal-preview">
									{draftLines.map((line, index) => (
										<li key={`${index}-${line}`}>
											<span className="pages-input-num">{index + 1}</span>
											<span className="pages-input-label" title={line}>
												{toPreviewLabel(line, profileOrigin)}
											</span>
										</li>
									))}
								</ol>
							) : (
								<p className="pages-input-modal-empty">Пока пусто — добавьте хотя бы один URL.</p>
							)}
						</div>

						<footer className="pages-input-modal-footer">
							<button type="button" className="secondary-button" onClick={cancelEditor}>
								Отмена
							</button>
							<button type="button" className="primary-button" onClick={applyEditor}>
								Применить
							</button>
						</footer>
					</div>
				</div>
			) : null}
		</div>
	);
}

function pluralPages(n: number): string
{
	const mod10 = n % 10;
	const mod100 = n % 100;

	if (mod100 >= 11 && mod100 <= 14) return 'страниц';
	if (mod10 === 1) return 'страница';
	if (mod10 >= 2 && mod10 <= 4) return 'страницы';
	return 'страниц';
}

export function normalizePagesForSubmit(raw: string, profileUrl: string): string[]
{
	const origin = originOf(profileUrl);
	const lines = parseLines(raw);

	return lines
		.map((line) =>
		{
			if (/^https?:\/\//i.test(line))
			{
				return line;
			}

			if (!origin)
			{
				return line;
			}

			return origin + (line.startsWith('/') ? line : '/' + line);
		})
		.filter(Boolean);
}
