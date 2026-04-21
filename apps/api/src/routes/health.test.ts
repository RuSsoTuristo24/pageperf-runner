import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerHealthRoutes } from './health.js';

describe('GET /health', () => {
	it('returns 200 when DB + worker both OK', async () => {
		const app = Fastify();
		registerHealthRoutes(app, {
			checkDb: async () => true,
			checkWorker: async () => true,
		});

		const res = await app.inject({ method: 'GET', url: '/health' });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body)).toEqual({ ok: true, db: 'ok', worker: 'ok' });
	});

	it('returns 503 when DB down', async () => {
		const app = Fastify();
		registerHealthRoutes(app, {
			checkDb: async () => false,
			checkWorker: async () => true,
		});

		const res = await app.inject({ method: 'GET', url: '/health' });
		expect(res.statusCode).toBe(503);
		expect(JSON.parse(res.body).db).toBe('fail');
	});

	it('returns 503 when worker unreachable', async () => {
		const app = Fastify();
		registerHealthRoutes(app, {
			checkDb: async () => true,
			checkWorker: async () => false,
		});

		const res = await app.inject({ method: 'GET', url: '/health' });
		expect(res.statusCode).toBe(503);
		expect(JSON.parse(res.body).worker).toBe('fail');
	});
});
