import { EventEmitter } from 'node:events';

import * as nodeCron from 'node-cron';
import type { RunSchedule } from '@pageperf-runner/shared';

import type { InMemoryProfileRepository } from '../profiles/profile.repository.js';
import { RunScheduleRepository, type RunScheduleInput } from './run-schedule.repository.js';

export class RunScheduleValidationError extends Error {}

export class RunScheduleNotFoundError extends Error {}

export type RunScheduleEvent =
	| { type: 'upsert'; schedule: RunSchedule }
	| { type: 'delete'; profileId: string };

export class RunScheduleService
{
	readonly #repository: RunScheduleRepository;
	readonly #profiles: InMemoryProfileRepository;
	readonly #events = new EventEmitter();

	constructor(repository: RunScheduleRepository, profiles: InMemoryProfileRepository)
	{
		this.#repository = repository;
		this.#profiles = profiles;
	}

	onChange(listener: (event: RunScheduleEvent) => void): () => void
	{
		this.#events.on('change', listener);
		return () => this.#events.off('change', listener);
	}

	list(): RunSchedule[]
	{
		return this.#repository.list();
	}

	findByProfile(profileId: string): RunSchedule | null
	{
		return this.#repository.findByProfile(profileId);
	}

	upsert(profileId: string, input: Omit<RunScheduleInput, 'profileId'>): RunSchedule
	{
		if (!this.#profiles.findById(profileId))
		{
			throw new RunScheduleNotFoundError('Profile not found');
		}

		const expression = typeof input.cronExpression === 'string' ? input.cronExpression.trim() : '';
		if (!expression || !nodeCron.validate(expression))
		{
			throw new RunScheduleValidationError('Invalid cron expression');
		}

		const enabled = typeof input.enabled === 'boolean' ? input.enabled : true;
		const saved = this.#repository.upsert({ profileId, cronExpression: expression, enabled });

		this.#events.emit('change', { type: 'upsert', schedule: saved });

		return saved;
	}

	deleteByProfile(profileId: string): boolean
	{
		const removed = this.#repository.deleteByProfile(profileId);
		if (removed)
		{
			this.#events.emit('change', { type: 'delete', profileId });
		}
		return removed;
	}

	markTriggered(id: string, runId: string): RunSchedule | null
	{
		return this.#repository.markTriggered(id, runId);
	}
}
