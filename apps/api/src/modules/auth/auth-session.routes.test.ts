import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

beforeEach(async () => {
  runExecutor.mockReset();
  authCapture.mockReset();
  authValidate.mockReset();
  authCapture.mockImplementation(async ({ storageStatePath }: { storageStatePath: string }) => {
    await mkdir(path.dirname(storageStatePath), { recursive: true });
    await writeFile(storageStatePath, JSON.stringify({ cookies: [], origins: [] }));
  });
  authValidate.mockResolvedValue(true);

  storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-auth-routes-'));
  app = await createApp({ runExecutor, authCapture, authValidate, storageRoot });
});

afterEach(async () => {
  await app.close();
  if (storageRoot)
  {
    await rm(storageRoot, { recursive: true, force: true });
    storageRoot = '';
  }
});

describe('auth session routes', () => {
  it('GET /api/auth/sessions returns an array of records (empty by default)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/sessions',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('POST /api/auth/sessions/capture with a valid body responds 200 and stores a ready record', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sessions/capture',
      payload: { targetUrl: 'https://portal.bitrix24.ru/auth/' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      host: 'portal.bitrix24.ru',
      status: 'ready',
      targetUrl: 'https://portal.bitrix24.ru/auth/',
    });

    const list = await app.inject({ method: 'GET', url: '/api/auth/sessions' });
    expect(list.json()).toEqual([
      expect.objectContaining({ host: 'portal.bitrix24.ru', status: 'ready' }),
    ]);
  });

  it('POST /api/auth/sessions/capture with a bad body responds 400', async () => {
    const missingUrl = await app.inject({
      method: 'POST',
      url: '/api/auth/sessions/capture',
      payload: {},
    });

    expect(missingUrl.statusCode).toBe(400);
    expect(missingUrl.json()).toMatchObject({ error: expect.any(String) });

    const badUrl = await app.inject({
      method: 'POST',
      url: '/api/auth/sessions/capture',
      payload: { targetUrl: 'not a url' },
    });

    expect(badUrl.statusCode).toBe(400);
  });

  it('GET /api/auth/sessions/:host returns the stored record when present', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sessions/capture',
      payload: { targetUrl: 'https://portal.bitrix24.ru/' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/sessions/portal.bitrix24.ru',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      host: 'portal.bitrix24.ru',
      status: 'ready',
    });
  });

  it('GET /api/auth/sessions/:host synthesizes a missing record for unknown hosts', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/sessions/unknown.example.com',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      host: 'unknown.example.com',
      status: 'missing',
    });
  });

  it('DELETE /api/auth/sessions/:host removes the record, then GET shows missing', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sessions/capture',
      payload: { targetUrl: 'https://portal.bitrix24.ru/' },
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/auth/sessions/portal.bitrix24.ru',
    });

    expect(deleted.statusCode).toBe(204);

    const list = await app.inject({ method: 'GET', url: '/api/auth/sessions' });
    expect(list.json()).toEqual([]);

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/auth/sessions/portal.bitrix24.ru',
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({
      host: 'portal.bitrix24.ru',
      status: 'missing',
    });
  });
});
