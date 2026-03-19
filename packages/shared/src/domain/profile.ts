import { z } from 'zod';

import { throttlingProfiles } from '../config.js';

export const throttlingPresetSchema = z.enum([
	'native',
	'slow-4g',
	'fast-3g',
	'slow-3g',
]);

export const authModeSchema = z.enum([
	'none',
	'session',
]);

export const cacheModeSchema = z.enum([
	'cold',
	'warm',
	'both',
]);

function hasSingleOrigin(url: string, pages: string[]): boolean
{
	try
	{
		const baseOrigin = new URL(url).origin;

		return pages.every((pageUrl) => new URL(pageUrl).origin === baseOrigin);
	}
	catch
	{
		return false;
	}
}

export const profileSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().min(1),
	url: z.string().url(),
	pages: z.array(z.string().url()).min(1).optional(),
	throttling: throttlingPresetSchema.default('native'),
	authMode: authModeSchema.default('none'),
	cacheMode: cacheModeSchema.default('cold'),
}).superRefine((value, context) => {
	if (value.pages && !hasSingleOrigin(value.url, value.pages))
	{
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['pages'],
			message: 'All profile pages must belong to the same origin.',
		});
	}
});

export type Profile = z.infer<typeof profileSchema>;

export const knownThrottlingProfiles = Object.keys(throttlingProfiles);
