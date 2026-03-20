import { useState } from 'react';

import type { ApiProfile } from '../../lib/api.js';

type RunLaunchFormProps = {
	name: string;
	pages: string;
	throttling: string;
	cacheMode: 'cold' | 'warm' | 'both';
	repeatCount: number;
	saveAsProfile: boolean;
	useAuthSession: boolean;
	isSubmitting: boolean;
	savedProfiles: ApiProfile[];
	onNameChange: (value: string) => void;
	onPagesChange: (value: string) => void;
	onThrottlingChange: (value: string) => void;
	onCacheModeChange: (value: 'cold' | 'warm' | 'both') => void;
	onRepeatCountChange: (value: number) => void;
	onSaveAsProfileChange: (value: boolean) => void;
	onUseAuthSessionChange: (value: boolean) => void;
	onLoadProfile: (profile: ApiProfile) => void;
	onDeleteProfile: (profileId: string) => void;
	onSubmit: () => void;
};

function getPageLines(pages: string): string[]
{
	return pages.split('\n').map((l) => l.trim()).filter(Boolean);
}

function getOrigins(lines: string[]): string[]
{
	const origins = new Set<string>();

	for (const line of lines)
	{
		try
		{
			origins.add(new URL(line).origin);
		}
		catch
		{
			// skip invalid
		}
	}

	return [...origins];
}

export function RunLaunchForm(props: RunLaunchFormProps)
{
	const [showPagesModal, setShowPagesModal] = useState(false);
	const [showProfilePicker, setShowProfilePicker] = useState(false);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const pageLines = getPageLines(props.pages);
	const pageCount = pageLines.length;
	const origins = getOrigins(pageLines);

	return (
		<section className="sidebar-section sidebar-section-launch" aria-labelledby="launch-heading">
			<div className="sidebar-section-heading">
				<div>
					<p className="eyebrow">Профилирование</p>
					<h2 id="launch-heading">Новый прогон</h2>
				</div>
			</div>

			{props.savedProfiles.length > 0 ? (
				<div className="field">
					<button
						type="button"
						className="secondary-button secondary-button-compact launch-profile-toggle"
						onClick={() => setShowProfilePicker((v) => !v)}
					>
						{showProfilePicker ? 'Скрыть шаблоны' : `Загрузить шаблон (${props.savedProfiles.length})`}
					</button>
					{showProfilePicker ? (
						<div className="launch-profile-list">
							{props.savedProfiles.map((profile) => {
								const profileOrigins = getOrigins(profile.pages ?? [profile.url]);

								return (
									<div key={profile.id} className="launch-profile-item-wrap">
										<button
											type="button"
											className="launch-profile-item"
											onClick={() => {
												props.onLoadProfile(profile);
												setShowProfilePicker(false);
											}}
										>
											<strong>{profile.name}</strong>
											<span className="launch-profile-origins">{profileOrigins.join(', ')}</span>
											<span className="launch-profile-meta">
												{(profile.pages?.length ?? 1)} URL / {profile.throttling} / {profile.cacheMode}
												{(profile.repeatCount ?? 1) > 1 ? ` / x${profile.repeatCount}` : ''}
											</span>
										</button>
										{confirmDeleteId === profile.id ? (
											<span className="launch-profile-confirm">
												<button
													type="button"
													className="launch-profile-delete-yes"
													onClick={(e) => { e.stopPropagation(); props.onDeleteProfile(profile.id); setConfirmDeleteId(null); }}
												>
													Да, удалить
												</button>
												<button
													type="button"
													className="launch-profile-delete-no"
													onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
												>
													Отмена
												</button>
											</span>
										) : (
											<button
												type="button"
												className="launch-profile-delete"
												title="Удалить шаблон"
												onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(profile.id); }}
											>
												×
											</button>
										)}
									</div>
								);
							})}
						</div>
					) : null}
				</div>
			) : null}

			<label className="field">
				<span>Имя</span>
				<input
					aria-label="Имя профиля"
					value={props.name}
					onChange={(event) => props.onNameChange(event.target.value)}
				/>
			</label>

			{pageCount > 0 ? (
				<div className="launch-origin-bar">
					{origins.map((origin) => (
						<span key={origin} className="launch-origin">{origin}</span>
					))}
				</div>
			) : null}

			<div className="field">
				<span>Страницы</span>
				<button
					type="button"
					className="launch-pages-button"
					onClick={() => setShowPagesModal(true)}
				>
					{pageCount > 0 ? `${pageCount} URL` : 'Добавить URL'}
					<span className="launch-pages-preview">
						{pageLines.slice(0, 3).map((url) => {
							try { return new URL(url).pathname; } catch { return url; }
						}).join(', ')}
						{pageCount > 3 ? ` +${pageCount - 3}` : ''}
					</span>
				</button>
			</div>
			<label className="field" title="Имитация медленного интернет-соединения. native = без ограничений (реальная скорость). slow-4g = типичный мобильный 4G (~1.6 Мбит/с, RTT 150мс). fast-3g = быстрый 3G (~1.5 Мбит/с, RTT 563мс). slow-3g = медленный 3G (~400 Кбит/с, RTT 2с).">
				<span>Пресет сети</span>
				<select
					aria-label="Пресет сети"
					value={props.throttling}
					onChange={(event) => props.onThrottlingChange(event.target.value)}
				>
					<option value="native">без ограничений</option>
					<option value="slow-4g">slow-4g</option>
					<option value="fast-3g">fast-3g</option>
					<option value="slow-3g">slow-3g</option>
				</select>
			</label>
			<label className="field" title="Холодный: первый визит, пустой кеш браузера. Тёплый: сначала прогрев (загрузка без замера), потом замер с кешем. Оба: два замера — сначала холодный, потом тёплый в том же контексте.">
				<span>Режим кеша</span>
				<select
					aria-label="Режим кеша"
					value={props.cacheMode}
					onChange={(event) => props.onCacheModeChange(event.target.value as 'cold' | 'warm' | 'both')}
				>
					<option value="cold">холодный</option>
					<option value="warm">тёплый</option>
					<option value="both">оба</option>
				</select>
			</label>
			{props.cacheMode === 'cold' ? (
				<label className="field" title="Количество повторных прогонов для статистической точности. Метрики рассчитываются по 80-му процентилю (p80). Каждый прогон в отдельном браузерном контексте.">
					<span>Повторы</span>
					<input
						aria-label="Количество повторных прогонов"
						type="number"
						min={1}
						max={20}
						value={props.repeatCount}
						onChange={(event) => props.onRepeatCountChange(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
					/>
					<span className="field-hint">1 = один прогон. 3–5 = стабильный p80.</span>
				</label>
			) : null}
			<label className="field-checkbox">
				<input
					checked={props.useAuthSession}
					type="checkbox"
					onChange={(event) => props.onUseAuthSessionChange(event.target.checked)}
				/>
				<span>Использовать сохранённую сессию</span>
			</label>
			<label className="field-checkbox" title="Сохранить текущие настройки как шаблон для повторного использования. Если выключено, прогон будет запущен без сохранения профиля.">
				<input
					checked={props.saveAsProfile}
					type="checkbox"
					onChange={(event) => props.onSaveAsProfileChange(event.target.checked)}
				/>
				<span>Сохранить как шаблон</span>
			</label>
			<button
				type="button"
				className="primary-button"
				onClick={props.onSubmit}
				disabled={props.isSubmitting || pageCount === 0}
			>
				{props.isSubmitting ? 'Профилирование…' : 'Запустить'}
			</button>

			{showPagesModal ? (
				<div className="modal-overlay" onClick={() => setShowPagesModal(false)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>Страницы для прогона</h3>
							<button type="button" className="modal-close" onClick={() => setShowPagesModal(false)}>×</button>
						</div>
						<textarea
							className="modal-textarea"
							placeholder={"https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3"}
							value={props.pages}
							onChange={(event) => props.onPagesChange(event.target.value)}
							autoFocus
						/>
						<div className="modal-footer">
							<span className="modal-count">{pageCount} URL</span>
							<button type="button" className="secondary-button secondary-button-compact" onClick={() => setShowPagesModal(false)}>
								Готово
							</button>
						</div>
					</div>
				</div>
			) : null}
		</section>
	);
}
