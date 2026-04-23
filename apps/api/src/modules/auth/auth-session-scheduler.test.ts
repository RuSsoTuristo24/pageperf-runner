import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionRepository } from './auth-session.repository.js';
import { AuthSessionScheduler } from './auth-session-scheduler.js';
import { AuthSessionService } from './auth-session.service.js';

let storageRoot = '';

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-auth-sched-'));
});

afterEach(async () => {
  if (storageRoot)
  {
    await rm(storageRoot, { recursive: true, force: true });
    storageRoot = '';
  }
});

async function seedStateFile(repository: AuthSessionRepository, host: string): Promise<void>
{
  const statePath = repository.getStateFilePath(host);
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify({ cookies: [], origins: [] }));
}

async function serviceWithTwoReady(): Promise<{
  service: AuthSessionService;
  refreshFn: ReturnType<typeof vi.fn>;
}>
{
  const repository = new AuthSessionRepository(storageRoot);
  await seedStateFile(repository, 'a.bitrix24.ru');
  await seedStateFile(repository, 'b.bitrix24.ru');
  repository.save({ host: 'a.bitrix24.ru', status: 'ready', targetUrl: 'https://a.bitrix24.ru/' });
  repository.save({ host: 'b.bitrix24.ru', status: 'ready', targetUrl: 'https://b.bitrix24.ru/' });
  repository.save({ host: 'c.bitrix24.ru', status: 'missing' });

  const refreshFn = vi.fn(async () => true);
  const service = new AuthSessionService(
    repository,
    async () => undefined,
    async () => true,
    refreshFn,
  );

  return { service, refreshFn };
}

describe('AuthSessionScheduler.runOnce', () => {
  it('refreshes every ready session and skips missing ones', async () => {
    const { service, refreshFn } = await serviceWithTwoReady();
    const scheduler = new AuthSessionScheduler(service);

    const result = await scheduler.runOnce();

    expect(result).toEqual({ refreshed: 2, failed: 0 });
    expect(refreshFn).toHaveBeenCalledTimes(2);
  });

  it('counts individual refresh failures without stopping the walk', async () => {
    const { service, refreshFn } = await serviceWithTwoReady();
    refreshFn.mockImplementationOnce(async () => false);

    const scheduler = new AuthSessionScheduler(service);
    const result = await scheduler.runOnce();

    expect(result).toEqual({ refreshed: 1, failed: 1 });
    expect(refreshFn).toHaveBeenCalledTimes(2);
  });
});

describe('AuthSessionScheduler.schedule', () => {
  it('passes the cron expression through to the cron lib and stores a handle', async () => {
    const { service } = await serviceWithTwoReady();
    const stop = vi.fn();
    const schedule = vi.fn(() => ({ stop }));
    const scheduler = new AuthSessionScheduler(
      service,
      { schedule: schedule as unknown as typeof import('node-cron').schedule },
    );

    scheduler.schedule('0 */6 * * *');

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith('0 */6 * * *', expect.any(Function));

    scheduler.stop();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
