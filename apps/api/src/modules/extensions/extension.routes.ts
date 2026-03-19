import type { FastifyInstance } from 'fastify';

import type { ExtensionResolver } from './extension-resolver.js';

const EXTENSION_NAME_REGEX = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;

export function registerExtensionRoutes(app: FastifyInstance, resolver: ExtensionResolver): void
{
	app.get('/api/extensions/url-index', async () =>
	{
		return resolver.getUrlIndex();
	});

	app.get('/api/extensions/:name/dependencies', async (request, reply) =>
	{
		const { name } = request.params as { name: string };

		if (!EXTENSION_NAME_REGEX.test(name))
		{
			reply.code(400);

			return { error: 'Invalid extension name. Expected format: module.extension (e.g. ui.vue3)' };
		}

		const tree = resolver.resolveTree(name);
		const flat = resolver.resolveFlat(name);

		return {
			extension: name,
			tree,
			flat,
			totalDeps: flat.length,
		};
	});
}
