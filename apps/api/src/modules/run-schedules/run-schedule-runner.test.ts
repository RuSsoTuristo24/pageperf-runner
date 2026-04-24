import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryProfileRepository } from '../profiles/profile.repository.js';
import { InMemoryRunRepository } from '../runs/run.repository.js';
import { RunService } from '../runs/run.service.js';
import { RunScheduleRepository } from './run-schedule.repository.js';
import { RunScheduleRunner } from './run-schedule-runner.js';
import { RunScheduleService } from './run-schedule.service.js';

type RegisteredCron = { expression: string; callback: () => void; stop: () => void };

function createFakeCron()
{
	const registrations: RegisteredCron[] = [];
	const cronLib = {
		schedule: vi.fn((expression: string, callback: () => void) => {
			const entry: RegisteredCron = { expression, callback, stop: vi.fn() };
			registrations.push(entry);
			return entry;
		}),
	};

	return { cronLib, registrations };
}

let storageRoot = '';
let profiles: InMemoryProfileRepository;
let schedules: RunScheduleRepository;
let scheduleService: RunScheduleService;
let runRepository: InMemoryRunRepository;
let runService: RunService;
let profileId: string;

beforeEach(async () => {
	storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-schedule-runner-'));
	profiles = new InMemoryProfileRepository(storageRoot);
	schedules = new RunScheduleRepository(storageRoot);
	scheduleService = new RunScheduleService(schedules, profiles);
	runRepository = new InMemoryRunRepository(storageRoot);
	runService = new RunService(runRepository, profiles);

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

describe('RunScheduleRunner', () => {
	it('start() registers a cron task for each enabled schedule', () => {
		scheduleService.upsert(profileId, { cronExpression: '0 3 * * *', enabled: true });
		const { cronLib, registrations } = createFakeCron();

		const runner = new RunScheduleRunner(scheduleService, runService, cronLib);
		runner.start();

		expect(registrations).toHaveLength(1);
		expect(registrations[0]?.expression).toBe('0 3 * * *');

		runner.stop();
	});

	it('re-registers a task when the cron expression changes', () => {
		scheduleService.upsert(profileId, { cronExpression: '0 3 * * *', enabled: true });
		const { cronLib, registrations } = createFakeCron();

		const runner = new RunScheduleRunner(scheduleService, runService, cronLib);
		runner.start();

		const firstStop = registrations[0]?.stop as unknown as ReturnType<typeof vi.fn>;

		scheduleService.upsert(profileId, { cronExpression: '*/10 * * * *', enabled: true });

		expect(registrations).toHaveLength(2);
		expect(registrations[1]?.expression).toBe('*/10 * * * *');
		expect(firstStop).toHaveBeenCalled();

		runner.stop();
	});

	it('unregisters a task when schedule is deleted', () => {
		scheduleService.upsert(profileId, { cronExpression: '0 3 * * *', enabled: true });
		const { cronLib, registrations } = createFakeCron();

		const runner = new RunScheduleRunner(scheduleService, runService, cronLib);
		runner.start();

		const stopMock = registrations[0]?.stop as unknown as ReturnType<typeof vi.fn>;
		scheduleService.deleteByProfile(profileId);

		expect(stopMock).toHaveBeenCalled();
		runner.stop();
	});

	it('skips registration for disabled schedules', () => {
		scheduleService.upsert(profileId, { cronExpression: '0 3 * * *', enabled: false });
		const { cronLib, registrations } = createFakeCron();

		const runner = new RunScheduleRunner(scheduleService, runService, cronLib);
		runner.start();

		expect(registrations).toHaveLength(0);
		runner.stop();
	});

	it('tick() creates a run, marks the schedule, and swallows run-start errors', async () => {
		const schedule = scheduleService.upsert(profileId, { cronExpression: '0 3 * * *', enabled: true });
		const startSpy = vi.spyOn(runService, 'start').mockRejectedValueOnce(new Error('worker offline'));
		const { cronLib } = createFakeCron();

		const runner = new RunScheduleRunner(scheduleService, runService, cronLib);
		await runner.tick(schedule);

		expect(startSpy).toHaveBeenCalled();
		const stored = scheduleService.findByProfile(profileId);
		expect(stored?.lastRunId).toMatch(/^[0-9a-f-]{36}$/);
		expect(runRepository.list()).toHaveLength(1);

		startSpy.mockRestore();
	});
});
