import path from 'node:path';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

export type ImageCoefficients = {
	png: number;
	jpg: number;
	gif: number;
	webp: number;
	avif: number;
	other: number;
};

export type AppSettings = {
	modulesRoot: string;
	imageCoefficients: ImageCoefficients;
};

const DEFAULTS: AppSettings = {
	modulesRoot: '',
	imageCoefficients: {
		png: 1.0,
		jpg: 0.3,
		gif: 0.5,
		webp: 0.15,
		avif: 0.1,
		other: 0.3,
	},
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
			this.settings.modulesRoot = patch.modulesRoot
				.trim()
				.replace(/\\/g, '/')
				.replace(/\/+$/, '');
		}

		if (patch.imageCoefficients !== undefined)
		{
			this.settings.imageCoefficients = {
				...this.settings.imageCoefficients,
				...patch.imageCoefficients,
			};
		}

		writeJsonFileSync(this.filePath, this.settings);

		return { ...this.settings };
	}
}
