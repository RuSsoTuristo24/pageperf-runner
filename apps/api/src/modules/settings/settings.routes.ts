import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';

import type { SettingsRepository } from './settings.repository.js';

type OnModulesRootChange = (newRoot: string) => void;

export function registerSettingsRoutes(
	app: FastifyInstance,
	repository: SettingsRepository,
	onModulesRootChange: OnModulesRootChange,
): void
{
	app.get('/api/settings', async () =>
	{
		return repository.get();
	});

	app.patch('/api/settings', async (request, reply) =>
	{
		const body = request.body as { modulesRoot?: unknown };

		if (typeof body.modulesRoot !== 'string')
		{
			reply.code(400);

			return { error: 'modulesRoot must be a string' };
		}

		const normalized = body.modulesRoot.trim().replace(/\\/g, '/').replace(/\/+$/, '');

		if (normalized !== '' && !existsSync(normalized))
		{
			reply.code(400);

			return { error: `Path does not exist: ${normalized}` };
		}

		const updated = repository.update({ modulesRoot: normalized });

		if (normalized !== '')
		{
			onModulesRootChange(normalized);
		}

		return updated;
	});
}
