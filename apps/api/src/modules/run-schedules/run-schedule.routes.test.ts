import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';

const runExecutor = vi.fn();
const authCapture = vi.fn();
const authValidate = vi.fn();

let app: FastifyInstance;
let storageRoot = '';
let profileId = '';

beforeEach(async () => {
	runExecutor.mockReset();
	authCapture.mockReset();
	authValidate.mockReset();

	storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-schedule-routes-'));
	app = await createApp({ runExecutor, authCapture, authValidate, storageRoot });

	const createProfileRes = await app.inject({
		method: 'POST',
		url: '/api/profiles',
		payload: {
			name: 'Scheduled portal',
			url: 'https://portal.example.com/',
			throttling: 'native',
			authMode: 'none',
		},
	});
	profileId = (createProfileRes.json() as { id: string }).id;
});

afterEach(async () => {
	await app.close();
	if (storageRoot)
	{
		await rm(storageRoot, { recursive: true, force: true });
		storageRoot = '';
	}
});

describe('run schedule routes', () => {
	it('GET /api/profiles/:id/schedule returns 404 when nothing is scheduled', async () => {
		const res = await app.inject({ method: 'GET', url: `/api/profiles/${profileId}/schedule` });
		expect(res.statusCode).toBe(404);
	});

	it('PUT then GET round-trips the stored schedule', async () => {
		const put = await app.inject({
			method: 'PUT',
			url: `/api/profiles/${profileId}/schedule`,
			payload: { cronExpression: '0 3 * * *', enabled: true },
		});
		expect(put.statusCode).toBe(200);
		const putBody = put.json() as { profileId: string; cronExpression: string; enabled: boolean };
		expect(putBody.profileId).toBe(profileId);
		expect(putBody.cronExpression).toBe('0 3 * * *');

		const get = await app.inject({ method: 'GET', url: `/api/profiles/${profileId}/schedule` });
		expect(get.statusCode).toBe(200);
		expect((get.json() as { cronExpression: string }).cronExpression).toBe('0 3 * * *');
	});

	it('PUT rejects invalid cron with 400', async () => {
		const res = await app.inject({
			method: 'PUT',
			url: `/api/profiles/${profileId}/schedule`,
			payload: { cronExpression: 'not-a-cron', enabled: true },
		});
		expect(res.statusCode).toBe(400);
	});

	it('PUT rejects unknown profile with 404', async () => {
		const res = await app.inject({
			method: 'PUT',
			url: '/api/profiles/11111111-1111-4111-8111-111111111111/schedule',
			payload: { cronExpression: '0 3 * * *', enabled: true },
		});
		expect(res.statusCode).toBe(404);
	});

	it('DELETE removes an existing schedule and subsequent GET returns 404', async () => {
		await app.inject({
			method: 'PUT',
			url: `/api/profiles/${profileId}/schedule`,
			payload: { cronExpression: '0 3 * * *', enabled: true },
		});

		const del = await app.inject({ method: 'DELETE', url: `/api/profiles/${profileId}/schedule` });
		expect(del.statusCode).toBe(204);

		const res = await app.inject({ method: 'GET', url: `/api/profiles/${profileId}/schedule` });
		expect(res.statusCode).toBe(404);
	});
});
