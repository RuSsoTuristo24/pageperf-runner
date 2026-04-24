import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryProfileRepository } from '../profiles/profile.repository.js';
import { RunScheduleRepository } from './run-schedule.repository.js';
import {
	RunScheduleNotFoundError,
	RunScheduleService,
	RunScheduleValidationError,
} from './run-schedule.service.js';

let storageRoot = '';
let profiles: InMemoryProfileRepository;
let schedules: RunScheduleRepository;
let service: RunScheduleService;
let profileId: string;

beforeEach(async () => {
	storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-schedule-service-'));
	profiles = new InMemoryProfileRepository(storageRoot);
	schedules = new RunScheduleRepository(storageRoot);
	service = new RunScheduleService(schedules, profiles);

	const profile = profiles.create({
		name: 'Portal',
		url: 'https://portal.example.com/',
		throttling: 'native',
		authMode: 'none',
	});
	profileId = profile.id;
});

afterEach(async () => {
	if (storageRoot)
	{
		await rm(storageRoot, { recursive: true, force: true });
		storageRoot = '';
	}
});

describe('RunScheduleService', () => {
	it('upsert stores a valid cron and emits change event', () => {
		const listener = vi.fn();
		service.onChange(listener);

		const schedule = service.upsert(profileId, { cronExpression: '0 3 * * *', enabled: true });

		expect(schedule.profileId).toBe(profileId);
		expect(listener).toHaveBeenCalledWith({ type: 'upsert', schedule });
	});

	it('upsert rejects an invalid cron expression', () => {
		expect(() => service.upsert(profileId, { cronExpression: 'nope', enabled: true }))
			.toThrow(RunScheduleValidationError);
	});

	it('upsert rejects an unknown profile', () => {
		expect(() => service.upsert('99999999-0000-4000-8000-000000000000', { cronExpression: '0 3 * * *', enabled: true }))
			.toThrow(RunScheduleNotFoundError);
	});

	it('deleteByProfile removes existing schedule and emits event', () => {
		service.upsert(profileId, { cronExpression: '0 3 * * *', enabled: true });
		const listener = vi.fn();
		service.onChange(listener);

		expect(service.deleteByProfile(profileId)).toBe(true);
		expect(listener).toHaveBeenCalledWith({ type: 'delete', profileId });
	});

	it('deleteByProfile is a no-op when nothing is scheduled', () => {
		const listener = vi.fn();
		service.onChange(listener);

		expect(service.deleteByProfile(profileId)).toBe(false);
		expect(listener).not.toHaveBeenCalled();
	});
});
