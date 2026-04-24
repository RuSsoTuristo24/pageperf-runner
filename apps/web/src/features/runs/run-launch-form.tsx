import { PagesInput } from './pages-input.js';

type RunLaunchFormProps = {
	name: string;
	url: string;
	pages: string;
	throttling: string;
	cacheMode: 'cold' | 'warm' | 'both';
	useAuthSession: boolean;
	saveAsTemplate: boolean;
	isSubmitting: boolean;
	onNameChange: (value: string) => void;
	onUrlChange: (value: string) => void;
	onPagesChange: (value: string) => void;
	onThrottlingChange: (value: string) => void;
	onCacheModeChange: (value: 'cold' | 'warm' | 'both') => void;
	onUseAuthSessionChange: (value: boolean) => void;
	onSaveAsTemplateChange: (value: boolean) => void;
	onSubmit: () => void;
};

export function RunLaunchForm(props: RunLaunchFormProps)
{
	return (
		<section className="sidebar-section sidebar-section-launch" aria-labelledby="launch-heading">
			<div className="sidebar-section-heading">
				<div>
					<p className="eyebrow">Профилирование</p>
					<h2 id="launch-heading">Создать профиль</h2>
				</div>
			</div>

			<p className="sidebar-copy">
				Запустить новый замер и добавить в список прогонов.
			</p>

			<label className="field">
				<span>Имя профиля</span>
				<input
					aria-label="Имя профиля"
					value={props.name}
					onChange={(event) => props.onNameChange(event.target.value)}
				/>
			</label>
			<label className="field">
				<span>URL профиля</span>
				<input
					aria-label="URL профиля"
					value={props.url}
					onChange={(event) => props.onUrlChange(event.target.value)}
				/>
			</label>
			<PagesInput
				value={props.pages}
				profileUrl={props.url}
				onChange={props.onPagesChange}
			/>
			<label className="field">
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
			<label className="field">
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
			<label className="field-checkbox">
				<input
					aria-label="Использовать сохранённую сессию"
					checked={props.useAuthSession}
					type="checkbox"
					onChange={(event) => props.onUseAuthSessionChange(event.target.checked)}
				/>
				<span>Использовать сохранённую сессию</span>
			</label>
			<label className="field-checkbox">
				<input
					aria-label="Сохранить как шаблон"
					checked={props.saveAsTemplate}
					type="checkbox"
					onChange={(event) => props.onSaveAsTemplateChange(event.target.checked)}
				/>
				<span>Сохранить как шаблон</span>
			</label>
			<button
				type="button"
				className="primary-button"
				onClick={props.onSubmit}
				disabled={props.isSubmitting}
			>
				{props.isSubmitting ? 'Профилирование…' : 'Создать и запустить'}
			</button>
		</section>
	);
}
