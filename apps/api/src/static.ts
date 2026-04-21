import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function registerStatic(app: FastifyInstance, distPath: string): Promise<void>
{
	await app.register(fastifyStatic, {
		root: distPath,
		prefix: '/',
		wildcard: false,
	});

	const indexPath = join(distPath, 'index.html');
	const hasIndex = existsSync(indexPath);
	const indexBody = hasIndex ? readFileSync(indexPath) : null;

	app.setNotFoundHandler((req, reply) => {
		if (req.url.startsWith('/api/') || req.url.startsWith('/health'))
		{
			reply.code(404).type('application/json').send({ error: 'Not found' });
			return;
		}
		if (!indexBody)
		{
			reply.code(404).send('UI build missing');
			return;
		}
		reply.code(200).type('text/html').send(indexBody);
	});
}
