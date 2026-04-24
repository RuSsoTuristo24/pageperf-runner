import * as nodeCron from 'node-cron';

import type { RunSchedule } from '@pageperf-runner/shared';

import type { RunService } from '../runs/run.service.js';
import type { RunScheduleEvent, RunScheduleService } from './run-schedule.service.js';

type CronLib = { schedule: typeof nodeCron.schedule };
type StoppableTask = { stop: () => void };

// Registers a node-cron task per enabled schedule. On CRUD events from
// the schedule service, re-registers the affected schedule's task. Each
// tick creates a fresh run for the profile and marks the schedule as
// triggered. Failures are logged but never thrown — the runner must
// keep ticking even if one profile's run blows up.
export class RunScheduleRunner
{
	readonly #schedules: RunScheduleService;
	readonly #runs: RunService;
	readonly #cronLib: CronLib;
	readonly #tasks = new Map<string, StoppableTask>();

	#unsubscribe: (() => void) | null = null;

	constructor(
		schedules: RunScheduleService,
		runs: RunService,
		cronLib: CronLib = nodeCron,
	)
	{
		this.#schedules = schedules;
		this.#runs = runs;
		this.#cronLib = cronLib;
	}

	start(): void
	{
		for (const schedule of this.#schedules.list())
		{
			this.#register(schedule);
		}

		this.#unsubscribe = this.#schedules.onChange((event) => this.#handleEvent(event));
	}

	stop(): void
	{
		if (this.#unsubscribe)
		{
			this.#unsubscribe();
			this.#unsubscribe = null;
		}

		for (const task of this.#tasks.values())
		{
			task.stop();
		}
		this.#tasks.clear();
	}

	async tick(schedule: RunSchedule): Promise<void>
	{
		try
		{
			const run = this.#runs.create({ profileId: schedule.profileId });
			this.#schedules.markTriggered(schedule.id, run.id);
			await this.#runs.start(run.id);
		}
		catch (err)
		{
			console.error(`[run-schedule] profile=${schedule.profileId} schedule=${schedule.id} failed:`, err);
		}
	}

	#register(schedule: RunSchedule): void
	{
		this.#tasks.get(schedule.profileId)?.stop();
		this.#tasks.delete(schedule.profileId);

		if (!schedule.enabled)
		{
			return;
		}

		const task = this.#cronLib.schedule(schedule.cronExpression, () => {
			void this.tick(schedule);
		}) as unknown as StoppableTask;

		this.#tasks.set(schedule.profileId, task);
	}

	#handleEvent(event: RunScheduleEvent): void
	{
		if (event.type === 'delete')
		{
			this.#tasks.get(event.profileId)?.stop();
			this.#tasks.delete(event.profileId);
			return;
		}

		this.#register(event.schedule);
	}
}
