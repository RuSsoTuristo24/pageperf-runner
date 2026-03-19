import path from 'node:path';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

export type AppSettings = {
	modulesRoot: string;
};

const DEFAULTS: AppSettings = {
	modulesRoot: '',
};

export class SettingsRepository
{
	private filePath: string;
	private settings: AppSettings;

	constructor(storageRoot: string)
	{
		this.filePath = path.join(storageRoot, 'data', 'settings.json');
		this.settings = { ...DEFAULTS, ...readJsonFileSync<Partial<AppSettings>>(this.filePath, {}) };
	}

	get(): AppSettings
	{
		return { ...this.settings };
	}

	update(patch: Partial<AppSettings>): AppSettings
	{
		if (patch.modulesRoot !== undefined)
		{
			// Normalize: trim, convert backslashes to forward slashes, strip trailing slash
			this.settings.modulesRoot = patch.modulesRoot
				.trim()
				.replace(/\\/g, '/')
				.replace(/\/+$/, '');
		}

		writeJsonFileSync(this.filePath, this.settings);

		return { ...this.settings };
	}
}
