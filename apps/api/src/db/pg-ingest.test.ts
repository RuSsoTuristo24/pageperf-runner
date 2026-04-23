import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from './client.js';
import {
	pgInsertPageMetrics,
	pgInsertProfile,
	pgInsertRequests,
	pgInsertRun,
	pgUpdateRunStatus,
} from './pg-ingest.js';

type SpyDb = Db & {
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	// Spies exposed for assertions:
	valuesSpy: ReturnType<typeof vi.fn>;
	setSpy: ReturnType<typeof vi.fn>;
	whereSpy: ReturnType<typeof vi.fn>;
};

function createSpyDb(options: { valuesRejects?: unknown; whereRejects?: unknown } = {}): SpyDb
{
	const valuesSpy = options.valuesRejects
		? vi.fn().mockRejectedValue(options.valuesRejects)
		: vi.fn().mockResolvedValue(undefined);
	const whereSpy = options.whereRejects
		? vi.fn().mockRejectedValue(options.whereRejects)
		: vi.fn().mockResolvedValue(undefined);
	const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
	const insert = vi.fn().mockReturnValue({ values: valuesSpy });
	const update = vi.fn().mockReturnValue({ set: setSpy });

	return {
		insert,
		update,
		valuesSpy,
		setSpy,
		whereSpy,
	} as unknown as SpyDb;
}

describe('pg-ingest helpers', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	describe('pgInsertProfile', () => {
		it('is a no-op when db is undefined', async () => {
			await expect(
				pgInsertProfile(undefined, {
					id: 'profile-1',
					name: 'n',
					url: 'https://example.com',
					throttling: 'native',
				}),
			).resolves.toBeUndefined();
		});

		it('inserts a profile row', async () => {
			const db = createSpyDb();
			await pgInsertProfile(db, {
				id: 'profile-1',
				name: 'n',
				url: 'https://example.com',
				throttling: 'native',
			});

			expect(db.insert).toHaveBeenCalledTimes(1);
			expect(db.valuesSpy).toHaveBeenCalledWith({
				id: 'profile-1',
				name: 'n',
				url: 'https://example.com',
				throttling: 'native',
			});
		});

		it('swallows insert errors and logs a warning', async () => {
			const db = createSpyDb({ valuesRejects: new Error('db down') });
			await expect(
				pgInsertProfile(db, {
					id: 'profile-1',
					name: 'n',
					url: 'https://example.com',
					throttling: 'native',
				}),
			).resolves.toBeUndefined();

			expect(warnSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('pgInsertRun', () => {
		it('is a no-op when db is undefined', async () => {
			await expect(
				pgInsertRun(undefined, { id: 'run-1', profileId: 'profile-1', status: 'running' }),
			).resolves.toBeUndefined();
		});

		it('inserts a run row with the provided status', async () => {
			const db = createSpyDb();
			await pgInsertRun(db, { id: 'run-1', profileId: 'profile-1', status: 'running' });

			expect(db.valuesSpy).toHaveBeenCalledWith({
				id: 'run-1',
				profileId: 'profile-1',
				status: 'running',
			});
		});

		it('swallows errors', async () => {
			const db = createSpyDb({ valuesRejects: new Error('nope') });
			await expect(
				pgInsertRun(db, { id: 'run-1', profileId: 'profile-1', status: 'running' }),
			).resolves.toBeUndefined();
			expect(warnSpy).toHaveBeenCalled();
		});
	});

	describe('pgUpdateRunStatus', () => {
		it('is a no-op when db is undefined', async () => {
			await expect(pgUpdateRunStatus(undefined, 'run-1', 'completed')).resolves.toBeUndefined();
		});

		it('calls update().set({ status }).where(...)', async () => {
			const db = createSpyDb();
			await pgUpdateRunStatus(db, 'run-1', 'completed');

			expect(db.update).toHaveBeenCalledTimes(1);
			expect(db.setSpy).toHaveBeenCalledWith({ status: 'completed' });
			expect(db.whereSpy).toHaveBeenCalledTimes(1);
		});

		it('swallows errors', async () => {
			const db = createSpyDb({ whereRejects: new Error('nope') });
			await expect(pgUpdateRunStatus(db, 'run-1', 'failed')).resolves.toBeUndefined();
			expect(warnSpy).toHaveBeenCalled();
		});
	});

	describe('pgInsertPageMetrics', () => {
		it('is a no-op when db is undefined', async () => {
			await expect(
				pgInsertPageMetrics(undefined, 'run-1', [{ name: 'fcp', value: 100 }]),
			).resolves.toBeUndefined();
		});

		it('is a no-op when metrics list is empty', async () => {
			const db = createSpyDb();
			await pgInsertPageMetrics(db, 'run-1', []);
			expect(db.insert).not.toHaveBeenCalled();
		});

		it('inserts all metric rows in one call and rounds fractional values', async () => {
			const db = createSpyDb();
			await pgInsertPageMetrics(db, 'run-1', [
				{ name: 'ttfb', value: 1200.5 },
				{ name: 'cls', value: 0.12 },
			]);

			expect(db.insert).toHaveBeenCalledTimes(1);
			const passedRows = db.valuesSpy.mock.calls[0]?.[0] as Array<{
				runId: string;
				name: string;
				value: number;
			}>;
			expect(passedRows).toHaveLength(2);
			expect(passedRows[0]).toMatchObject({ runId: 'run-1', name: 'ttfb', value: 1201 });
			expect(passedRows[1]).toMatchObject({ runId: 'run-1', name: 'cls', value: 0 });
		});

		it('swallows errors', async () => {
			const db = createSpyDb({ valuesRejects: new Error('nope') });
			await expect(
				pgInsertPageMetrics(db, 'run-1', [{ name: 'fcp', value: 100 }]),
			).resolves.toBeUndefined();
			expect(warnSpy).toHaveBeenCalled();
		});
	});

	describe('pgInsertRequests', () => {
		it('is a no-op when db is undefined', async () => {
			await expect(
				pgInsertRequests(undefined, 'run-1', [
					{ url: 'https://example.com', resourceType: 'document', status: 200 },
				]),
			).resolves.toBeUndefined();
		});

		it('is a no-op when items list is empty', async () => {
			const db = createSpyDb();
			await pgInsertRequests(db, 'run-1', []);
			expect(db.insert).not.toHaveBeenCalled();
		});

		it('inserts rows and falls back to status=0 for missing statuses', async () => {
			const db = createSpyDb();
			await pgInsertRequests(db, 'run-1', [
				{ url: 'https://a.test', resourceType: 'document', status: 200 },
				{ url: 'https://b.test', resourceType: 'script' },
			]);

			const passedRows = db.valuesSpy.mock.calls[0]?.[0] as Array<{
				runId: string;
				url: string;
				resourceType: string;
				status: number;
			}>;
			expect(passedRows).toHaveLength(2);
			expect(passedRows[0]).toMatchObject({
				runId: 'run-1',
				url: 'https://a.test',
				resourceType: 'document',
				status: 200,
			});
			expect(passedRows[1]).toMatchObject({
				runId: 'run-1',
				url: 'https://b.test',
				resourceType: 'script',
				status: 0,
			});
		});

		it('swallows errors', async () => {
			const db = createSpyDb({ valuesRejects: new Error('nope') });
			await expect(
				pgInsertRequests(db, 'run-1', [
					{ url: 'https://a.test', resourceType: 'document', status: 200 },
				]),
			).resolves.toBeUndefined();
			expect(warnSpy).toHaveBeenCalled();
		});
	});
});
