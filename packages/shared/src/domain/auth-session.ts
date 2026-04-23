import { z } from 'zod';

export const authSessionStatusSchema = z.enum([
	'missing',
	'capturing',
	'ready',
	'failed',
]);

export type AuthSessionStatus = z.infer<typeof authSessionStatusSchema>;

export const authSessionRecordSchema = z.object({
	host: z.string().min(1),
	status: authSessionStatusSchema,
	targetUrl: z.string().url().optional(),
	updatedAt: z.string().datetime().optional(),
	error: z.string().optional(),
});

export type AuthSessionRecord = z.infer<typeof authSessionRecordSchema>;

export function hostFromUrl(url: string): string
{
	return new URL(url).host;
}
