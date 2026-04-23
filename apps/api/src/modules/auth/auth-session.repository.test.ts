import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthSessionRepository } from './auth-session.repository.js';

let storageRoot = '';

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-auth-repo-'));
});

afterEach(async () => {
  if (storageRoot)
  {
    await rm(storageRoot, { recursive: true, force: true });
    storageRoot = '';
  }
});

describe('AuthSessionRepository', () => {
  it('returns an empty list when no registry file exists', () => {
    const repo = new AuthSessionRepository(storageRoot);

    expect(repo.list()).toEqual([]);
  });

  it('sorts list entries by host', () => {
    const repo = new AuthSessionRepository(storageRoot);

    repo.save({ host: 'portal.bitrix24.ru', status: 'ready' });
    repo.save({ host: 'alpha.bitrix24.com', status: 'missing' });
    repo.save({ host: 'stage.bitrix24.net', status: 'ready' });

    expect(repo.list().map((record) => record.host)).toEqual([
      'alpha.bitrix24.com',
      'portal.bitrix24.ru',
      'stage.bitrix24.net',
    ]);
  });

  it('roundtrips save and get for a given host', () => {
    const repo = new AuthSessionRepository(storageRoot);
    const saved = repo.save({
      host: 'portal.bitrix24.ru',
      status: 'capturing',
      targetUrl: 'https://portal.bitrix24.ru/',
      updatedAt: '2026-04-23T00:00:00.000Z',
    });

    expect(saved).toMatchObject({
      host: 'portal.bitrix24.ru',
      status: 'capturing',
    });

    expect(repo.get('portal.bitrix24.ru')).toMatchObject({
      host: 'portal.bitrix24.ru',
      status: 'capturing',
      targetUrl: 'https://portal.bitrix24.ru/',
    });
    expect(repo.get('unknown.example')).toBeNull();
  });

  it('delete removes registry entry and state file when present', () => {
    const repo = new AuthSessionRepository(storageRoot);
    repo.save({
      host: 'portal.bitrix24.ru',
      status: 'ready',
      targetUrl: 'https://portal.bitrix24.ru/',
    });

    const statePath = repo.getStateFilePath('portal.bitrix24.ru');
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ cookies: [] }));

    expect(existsSync(statePath)).toBe(true);

    repo.delete('portal.bitrix24.ru');

    expect(repo.get('portal.bitrix24.ru')).toBeNull();
    expect(existsSync(statePath)).toBe(false);

    // Second delete is a no-op.
    repo.delete('portal.bitrix24.ru');
    expect(repo.list()).toEqual([]);
  });

  it('self-heals ready -> missing when the state file is gone', () => {
    const repo = new AuthSessionRepository(storageRoot);
    repo.save({
      host: 'portal.bitrix24.ru',
      status: 'ready',
      targetUrl: 'https://portal.bitrix24.ru/',
    });

    // No state file was ever written. The repo must self-heal on read.
    const record = repo.get('portal.bitrix24.ru');

    expect(record?.status).toBe('missing');

    // Confirm persistence: reopen the repo and check the registry is updated.
    const reopened = new AuthSessionRepository(storageRoot);
    expect(reopened.get('portal.bitrix24.ru')?.status).toBe('missing');
  });

  it('migrates legacy default.json layout on construction', () => {
    // Simulate pre-per-host files in a fresh storage root.
    const legacyRegistry = path.join(storageRoot, 'data', 'auth', 'session.json');
    const legacyState = path.join(storageRoot, 'auth', 'default.json');

    mkdirSync(path.dirname(legacyRegistry), { recursive: true });
    mkdirSync(path.dirname(legacyState), { recursive: true });

    writeFileSync(
      legacyRegistry,
      JSON.stringify({
        id: 'default',
        status: 'ready',
        targetUrl: 'https://legacy.bitrix24.ru/blank.php',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }),
    );
    writeFileSync(legacyState, JSON.stringify({ cookies: [] }));

    const repo = new AuthSessionRepository(storageRoot);

    // Legacy files must be gone after migration.
    expect(existsSync(legacyRegistry)).toBe(false);
    expect(existsSync(legacyState)).toBe(false);

    const migrated = repo.get('legacy.bitrix24.ru');
    expect(migrated).toMatchObject({
      host: 'legacy.bitrix24.ru',
      status: 'ready',
      targetUrl: 'https://legacy.bitrix24.ru/blank.php',
    });

    // The state file moved to the host-keyed layout.
    expect(existsSync(repo.getStateFilePath('legacy.bitrix24.ru'))).toBe(true);
  });
});
