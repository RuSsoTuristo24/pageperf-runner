import cron from 'node-cron';

import type { ProfileRepository, StoredProfile } from '../profiles/profile.repository.types.js';
import type { RunService } from '../runs/run.service.js';

type ScheduledJob = {
	profileId: string;
	profileName: string;
	cronExpression: string;
	task: cron.ScheduledTask;
};

export class SchedulerService
{
	#jobs = new Map<string, ScheduledJob>();
	#runService: RunService;
	#profiles: ProfileRepository;

	constructor(runService: RunService, profiles: ProfileRepository)
	{
		this.#runService = runService;
		this.#profiles = profiles;
	}

	async init(): Promise<void>
	{
		const profiles = await this.#profiles.list();
		const scheduled = profiles.filter((p) => p.scheduled && p.cronExpression);

		for (const profile of scheduled)
		{
			this.#scheduleProfile(profile);
		}

		if (scheduled.length > 0)
		{
			console.log(`Scheduler: ${scheduled.length} scheduled profile(s) active`);
		}
	}

	async refresh(): Promise<void>
	{
		for (const job of this.#jobs.values())
		{
			job.task.stop();
		}
		this.#jobs.clear();

		await this.init();
	}

	getStatus(): Array<{ profileId: string; profileName: string; cronExpression: string; running: boolean }>
	{
		return [...this.#jobs.values()].map((job) => ({
			profileId: job.profileId,
			profileName: job.profileName,
			cronExpression: job.cronExpression,
			running: true,
		}));
	}

	stop(): void
	{
		for (const job of this.#jobs.values())
		{
			job.task.stop();
		}
		this.#jobs.clear();
	}

	#scheduleProfile(profile: StoredProfile): void
	{
		const expression = profile.cronExpression as string;

		if (!cron.validate(expression))
		{
			console.warn(`Scheduler: invalid cron "${expression}" for profile "${profile.name}", skipping`);

			return;
		}

		const task = cron.schedule(expression, async () => {
			console.log(`Scheduler: running profile "${profile.name}" (${profile.id})`);

			try
			{
				const run = await this.#runService.create({ profileId: profile.id });
				await this.#runService.start(run.id);
				console.log(`Scheduler: completed run ${run.id} for "${profile.name}"`);
			}
			catch (error)
			{
				console.error(`Scheduler: failed run for "${profile.name}":`, error instanceof Error ? error.message : error);
			}
		});

		this.#jobs.set(profile.id, {
			profileId: profile.id,
			profileName: profile.name,
			cronExpression: expression,
			task,
		});
	}
}
