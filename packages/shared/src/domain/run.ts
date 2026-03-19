import { z } from 'zod';

export const runStatusSchema = z.enum([
	'queued',
	'running',
	'completed',
	'failed',
	'cancelled',
]);

export const runSchema = z.object({
	id: z.string().uuid().optional(),
	profileId: z.string().uuid(),
	status: runStatusSchema,
	createdAt: z.string().datetime().optional(),
	completedAt: z.string().datetime().optional(),
});

export type Run = z.infer<typeof runSchema>;
