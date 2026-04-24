import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { RunSchedule } from '@pageperf-runner/shared';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

export type RunScheduleInput = {
	profileId: string;
	cronExpression: string;
	enabled: boolean;
};

export class RunScheduleRepository
{
	#schedules: RunSchedule[];

	readonly #storageFilePath?: string;

	constructor(storageRoot?: string)
	{
		this.#storageFilePath = storageRoot ? path.join(storageRoot, 'data', 'run-schedules.json') : undefined;
		this.#schedules = this.#storageFilePath
			? readJsonFileSync<RunSchedule[]>(this.#storageFilePath, [])
			: [];
	}

	list(): RunSchedule[]
	{
		return this.#schedules.map((schedule) => ({ ...schedule }));
	}

	findByProfile(profileId: string): RunSchedule | null
	{
		const hit = this.#schedules.find((schedule) => schedule.profileId === profileId);
		return hit ? { ...hit } : null;
	}

	findById(id: string): RunSchedule | null
	{
		const hit = this.#schedules.find((schedule) => schedule.id === id);
		return hit ? { ...hit } : null;
	}

	upsert(input: RunScheduleInput): RunSchedule
	{
		const now = new Date().toISOString();
		const existing = this.#schedules.find((schedule) => schedule.profileId === input.profileId);

		if (existing)
		{
			existing.cronExpression = input.cronExpression;
			existing.enabled = input.enabled;
			existing.updatedAt = now;
			this.#persist();
			return { ...existing };
		}

		const fresh: RunSchedule = {
			id: randomUUID(),
			profileId: input.profileId,
			cronExpression: input.cronExpression,
			enabled: input.enabled,
			lastTriggeredAt: null,
			lastRunId: null,
			createdAt: now,
			updatedAt: now,
		};

		this.#schedules.push(fresh);
		this.#persist();

		return { ...fresh };
	}

	deleteByProfile(profileId: string): boolean
	{
		const before = this.#schedules.length;
		this.#schedules = this.#schedules.filter((schedule) => schedule.profileId !== profileId);
		const removed = this.#schedules.length !== before;

		if (removed)
		{
			this.#persist();
		}

		return removed;
	}

	markTriggered(id: string, runId: string, at: string = new Date().toISOString()): RunSchedule | null
	{
		const schedule = this.#schedules.find((candidate) => candidate.id === id);
		if (!schedule)
		{
			return null;
		}

		schedule.lastRunId = runId;
		schedule.lastTriggeredAt = at;
		schedule.updatedAt = at;
		this.#persist();

		return { ...schedule };
	}

	#persist(): void
	{
		if (!this.#storageFilePath)
		{
			return;
		}

		writeJsonFileSync(this.#storageFilePath, this.#schedules);
	}
}
