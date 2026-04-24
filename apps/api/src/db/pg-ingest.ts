import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { Db } from './client.js';
import { pageMetrics, profiles, requests, runs } from './schema.js';

export type PgProfileRow = {
	id: string;
	name: string;
	url: string;
	throttling: string;
	isTemplate?: boolean;
	createdAt?: Date;
};

export type PgRunRow = {
	id: string;
	profileId: string;
	status: string;
	createdAt?: Date;
};

export type PgPageMetricInput = {
	name: string;
	value: number;
};

export type PgRequestInput = {
	url: string;
	resourceType: string;
	status?: number;
};

function logFailure(operation: string, error: unknown): void
{
	// Intentionally non-throwing: PG outages must never fail a live run.
	// eslint-disable-next-line no-console
	console.warn(`[pg-ingest] ${operation} failed:`, error);
}

export async function pgInsertProfile(db: Db | undefined, row: PgProfileRow): Promise<void>
{
	if (!db)
	{
		return;
	}

	try
	{
		await db.insert(profiles).values({
			id: row.id,
			name: row.name,
			url: row.url,
			throttling: row.throttling,
			...(row.isTemplate !== undefined ? { isTemplate: row.isTemplate } : {}),
			...(row.createdAt ? { createdAt: row.createdAt } : {}),
		});
	}
	catch (error)
	{
		logFailure('profile insert', error);
	}
}

export async function pgUpdateProfileTemplate(
	db: Db | undefined,
	profileId: string,
	isTemplate: boolean,
): Promise<void>
{
	if (!db)
	{
		return;
	}

	try
	{
		await db.update(profiles).set({ isTemplate }).where(eq(profiles.id, profileId));
	}
	catch (error)
	{
		logFailure('profile template update', error);
	}
}

export async function pgInsertRun(db: Db | undefined, row: PgRunRow): Promise<void>
{
	if (!db)
	{
		return;
	}

	try
	{
		await db.insert(runs).values({
			id: row.id,
			profileId: row.profileId,
			status: row.status,
			...(row.createdAt ? { createdAt: row.createdAt } : {}),
		});
	}
	catch (error)
	{
		logFailure('run insert', error);
	}
}

export async function pgUpdateRunStatus(
	db: Db | undefined,
	runId: string,
	status: string,
): Promise<void>
{
	if (!db)
	{
		return;
	}

	try
	{
		await db.update(runs).set({ status }).where(eq(runs.id, runId));
	}
	catch (error)
	{
		logFailure('run status update', error);
	}
}

export async function pgInsertPageMetrics(
	db: Db | undefined,
	runId: string,
	metrics: PgPageMetricInput[],
): Promise<void>
{
	if (!db || metrics.length === 0)
	{
		return;
	}

	try
	{
		const rows = metrics.map((metric) => ({
			id: randomUUID(),
			runId,
			name: metric.name,
			// page_metrics.value is INTEGER — round fractional values (CLS, etc.).
			value: Math.round(metric.value),
		}));
		await db.insert(pageMetrics).values(rows);
	}
	catch (error)
	{
		logFailure('page metrics insert', error);
	}
}

export async function pgInsertRequests(
	db: Db | undefined,
	runId: string,
	items: PgRequestInput[],
): Promise<void>
{
	if (!db || items.length === 0)
	{
		return;
	}

	try
	{
		const rows = items.map((item) => ({
			id: randomUUID(),
			runId,
			url: item.url,
			resourceType: item.resourceType,
			// requests.status is NOT NULL — fall back to 0 when the upstream
			// record has no HTTP status (e.g. aborted or cached responses).
			status: typeof item.status === 'number' ? item.status : 0,
		}));
		await db.insert(requests).values(rows);
	}
	catch (error)
	{
		logFailure('requests insert', error);
	}
}
