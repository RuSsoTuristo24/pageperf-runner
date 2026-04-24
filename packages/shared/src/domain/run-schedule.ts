import { z } from 'zod';

export const runScheduleSchema = z.object({
	id: z.string().uuid(),
	profileId: z.string().uuid(),
	cronExpression: z.string().min(1),
	enabled: z.boolean(),
	lastTriggeredAt: z.string().datetime().nullable().optional(),
	lastRunId: z.string().uuid().nullable().optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type RunSchedule = z.infer<typeof runScheduleSchema>;

export const runSchedulePresets = [
	{ label: 'каждый час', expression: '0 * * * *' },
	{ label: 'каждые 6 часов', expression: '0 */6 * * *' },
	{ label: 'каждый день в 3:00', expression: '0 3 * * *' },
	{ label: 'каждую неделю в понедельник 3:00', expression: '0 3 * * 1' },
] as const;

export type RunSchedulePreset = typeof runSchedulePresets[number];
