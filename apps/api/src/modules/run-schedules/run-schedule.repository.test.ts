import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RunScheduleRepository } from './run-schedule.repository.js';

const PROFILE_A = '00000000-0000-4000-8000-00000000aaaa';
const PROFILE_B = '00000000-0000-4000-8000-00000000bbbb';
const RUN_A = '00000000-0000-4000-8000-00000000cccc';

let storageRoot = '';

beforeEach(async () => {
	storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-schedule-repo-'));
});

afterEach(async () => {
	if (storageRoot)
	{
		await rm(storageRoot, { recursive: true, force: true });
		storageRoot = '';
	}
});

describe('RunScheduleRepository', () => {
	it('starts empty and creates via upsert', () => {
		const repo = new RunScheduleRepository(storageRoot);
		expect(repo.list()).toEqual([]);

		const schedule = repo.upsert({ profileId: PROFILE_A, cronExpression: '0 3 * * *', enabled: true });

		expect(schedule.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(schedule.profileId).toBe(PROFILE_A);
		expect(schedule.cronExpression).toBe('0 3 * * *');
		expect(schedule.enabled).toBe(true);
		expect(schedule.lastTriggeredAt).toBeNull();
		expect(repo.list()).toHaveLength(1);
	});

	it('upsert replaces existing schedule for the same profile instead of creating a second', () => {
		const repo = new RunScheduleRepository(storageRoot);
		const first = repo.upsert({ profileId: PROFILE_A, cronExpression: '0 3 * * *', enabled: true });
		const second = repo.upsert({ profileId: PROFILE_A, cronExpression: '*/10 * * * *', enabled: false });

		expect(second.id).toBe(first.id);
		expect(second.cronExpression).toBe('*/10 * * * *');
		expect(second.enabled).toBe(false);
		expect(repo.list()).toHaveLength(1);
	});

	it('persists to disk across instances', () => {
		const writer = new RunScheduleRepository(storageRoot);
		writer.upsert({ profileId: PROFILE_A, cronExpression: '0 * * * *', enabled: true });

		const reader = new RunScheduleRepository(storageRoot);
		const schedule = reader.findByProfile(PROFILE_A);
		expect(schedule?.cronExpression).toBe('0 * * * *');
	});

	it('markTriggered updates lastRunId and lastTriggeredAt', () => {
		const repo = new RunScheduleRepository(storageRoot);
		const schedule = repo.upsert({ profileId: PROFILE_A, cronExpression: '0 3 * * *', enabled: true });

		const marked = repo.markTriggered(schedule.id, RUN_A, '2026-05-01T00:00:00.000Z');

		expect(marked?.lastRunId).toBe(RUN_A);
		expect(marked?.lastTriggeredAt).toBe('2026-05-01T00:00:00.000Z');
	});

	it('deleteByProfile removes only the matching profile and reports the result', () => {
		const repo = new RunScheduleRepository(storageRoot);
		repo.upsert({ profileId: PROFILE_A, cronExpression: '0 3 * * *', enabled: true });
		repo.upsert({ profileId: PROFILE_B, cronExpression: '0 * * * *', enabled: true });

		expect(repo.deleteByProfile(PROFILE_A)).toBe(true);
		expect(repo.list().map((schedule) => schedule.profileId)).toEqual([PROFILE_B]);
		expect(repo.deleteByProfile(PROFILE_A)).toBe(false);
	});
});
