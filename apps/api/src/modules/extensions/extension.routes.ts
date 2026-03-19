import type { FastifyInstance } from 'fastify';

import type { ExtensionResolver } from './extension-resolver.js';

const EXTENSION_NAME_REGEX = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;

type ResolverHolder = { current: ExtensionResolver | null };

export function registerExtensionRoutes(app: FastifyInstance, holder: ResolverHolder): void
{
	app.get('/api/extensions/url-index', async (request, reply) =>
	{
		if (!holder.current)
		{
			reply.code(503);

			return { error: 'Modules path not configured. Set it in Settings.' };
		}

		return holder.current.getUrlIndex();
	});

	app.get('/api/extensions/:name/dependencies', async (request, reply) =>
	{
		if (!holder.current)
		{
			reply.code(503);

			return { error: 'Modules path not configured. Set it in Settings.' };
		}

		const { name } = request.params as { name: string };

		if (!EXTENSION_NAME_REGEX.test(name))
		{
			reply.code(400);

			return { error: 'Invalid extension name. Expected format: module.extension (e.g. ui.vue3)' };
		}

		const tree = holder.current.resolveTree(name);
		const flat = holder.current.resolveFlat(name);

		return {
			extension: name,
			tree,
			flat,
			totalDeps: flat.length,
		};
	});
}
