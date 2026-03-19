import { z } from 'zod';

export const assetIssueStatusSchema = z.enum([
	'open',
	'review',
	'closed',
]);

export const assetIssueSchema = z.object({
	assetKey: z.string().url().optional(),
	assetUrl: z.string().url(),
	resourceType: z.string().min(1),
	mantisUrl: z.string().url(),
	status: assetIssueStatusSchema,
	note: z.string().default(''),
	createdAt: z.string().datetime().optional(),
	updatedAt: z.string().datetime().optional(),
	closedAt: z.string().datetime().optional(),
});

export type AssetIssue = z.infer<typeof assetIssueSchema>;

export function normalizeAssetUrl(assetUrl: string): string
{
	try
	{
		const parsedUrl = new URL(assetUrl);

		return `${parsedUrl.origin}${parsedUrl.pathname}`;
	}
	catch
	{
		return assetUrl.split('?')[0] ?? assetUrl;
	}
}
