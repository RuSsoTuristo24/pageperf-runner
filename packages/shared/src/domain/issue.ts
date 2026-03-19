import { z } from 'zod';

export const issueSeveritySchema = z.enum([
	'info',
	'warning',
	'critical',
]);

export const issueSchema = z.object({
	code: z.string().min(1),
	severity: issueSeveritySchema,
	evidence: z.array(z.string()).default([]),
});

export type Issue = z.infer<typeof issueSchema>;
