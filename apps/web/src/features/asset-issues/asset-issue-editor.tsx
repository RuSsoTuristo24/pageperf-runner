import { useState } from 'react';

import type { ApiAssetIssue } from '../../lib/api.js';

type AssetIssueEditorProps = {
	assetUrl: string;
	resourceType: string;
	issue?: ApiAssetIssue;
	isSaving: boolean;
	onCancel: () => void;
	onSave: (input: {
		assetKey?: string;
		assetUrl: string;
		resourceType: string;
		mantisUrl: string;
		status: 'open' | 'review' | 'closed';
		note: string;
	}) => Promise<void> | void;
	onDelete?: (assetKey: string) => Promise<void> | void;
};

export function AssetIssueEditor({
	assetUrl,
	resourceType,
	issue,
	isSaving,
	onCancel,
	onSave,
	onDelete,
}: AssetIssueEditorProps)
{
	const [mantisUrl, setMantisUrl] = useState(issue?.mantisUrl ?? '');
	const [status, setStatus] = useState<ApiAssetIssue['status']>(issue?.status ?? 'open');
	const [note, setNote] = useState(issue?.note ?? '');

	return (
		<form
			className="issue-editor"
			onSubmit={(event) => {
				event.preventDefault();
				void onSave({
					assetKey: issue?.assetKey,
					assetUrl,
					resourceType,
					mantisUrl,
					status,
					note,
				});
			}}
		>
			<label className="issue-editor-field">
				<span>Mantis URL</span>
				<input
					aria-label="Mantis URL"
					type="url"
					value={mantisUrl}
					onChange={(event) => setMantisUrl(event.target.value)}
				/>
			</label>
			<label className="issue-editor-field issue-editor-field-compact">
				<span>Статус</span>
				<select
					aria-label="Статус"
					value={status}
					onChange={(event) => setStatus(event.target.value as ApiAssetIssue['status'])}
				>
					<option value="open">open</option>
					<option value="review">review</option>
					<option value="closed">closed</option>
				</select>
			</label>
			<label className="issue-editor-field issue-editor-field-wide">
				<span>Заметка</span>
				<input
					aria-label="Issue Note"
					type="text"
					value={note}
					onChange={(event) => setNote(event.target.value)}
				/>
			</label>
			<div className="issue-editor-actions">
				{issue?.assetKey && onDelete ? (
					<button
						className="secondary-button secondary-button-danger"
						type="button"
						disabled={isSaving}
						onClick={() => {
							void onDelete(issue.assetKey!);
						}}
					>
						Удалить
					</button>
				) : null}
				<button className="secondary-button" type="button" onClick={onCancel}>
					Отмена
				</button>
				<button className="primary-button primary-button-inline" type="submit" disabled={isSaving}>
					Сохранить
				</button>
			</div>
		</form>
	);
}
