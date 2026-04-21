import { describe, it, expect, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerStatic } from './static.js';

const DIST = join(import.meta.dirname ?? __dirname, '__tmp_dist');

beforeAll(() => {
	mkdirSync(join(DIST, 'assets'), { recursive: true });
	writeFileSync(join(DIST, 'index.html'), '<!doctype html><html><body>SPA</body></html>');
	writeFileSync(join(DIST, 'assets', 'app.js'), 'console.log("app");');
});

async function buildApp(): Promise<FastifyInstance>
{
	const app = Fastify();
	app.get('/api/ping', async () => ({ ok: true }));
	await registerStatic(app, DIST);
	await app.ready();
	return app;
}

describe('static serving + SPA fallback', () => {
	it('serves index.html at /', async () => {
		const app = await buildApp();
		const res = await app.inject({ method: 'GET', url: '/' });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('SPA');
	});

	it('serves built assets under /assets/', async () => {
		const app = await buildApp();
		const res = await app.inject({ method: 'GET', url: '/assets/app.js' });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('console.log');
	});

	it('returns index.html for unknown non-API routes (SPA fallback)', async () => {
		const app = await buildApp();
		const res = await app.inject({ method: 'GET', url: '/runs/42' });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('SPA');
	});

	it('does NOT fallback for /api/* routes', async () => {
		const app = await buildApp();
		const res = await app.inject({ method: 'GET', url: '/api/ping' });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body)).toEqual({ ok: true });
	});

	it('returns 404 JSON for unknown /api/* routes', async () => {
		const app = await buildApp();
		const res = await app.inject({ method: 'GET', url: '/api/nope' });
		expect(res.statusCode).toBe(404);
		expect(res.headers['content-type']).toContain('application/json');
	});
});
