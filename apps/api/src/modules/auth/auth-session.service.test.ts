import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionRepository } from './auth-session.repository.js';
import {
  AuthSessionExpiredError,
  AuthSessionService,
  AuthSessionValidationError,
} from './auth-session.service.js';

let storageRoot = '';

async function writeStateFile(filePath: string): Promise<void>
{
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({ cookies: [], origins: [] }));
}

function createService(overrides?: {
  capture?: (input: { targetUrl: string; storageStatePath: string }) => Promise<void>;
  validate?: (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>;
}): {
  service: AuthSessionService;
  repository: AuthSessionRepository;
  captureFn: ReturnType<typeof vi.fn>;
  validateFn: ReturnType<typeof vi.fn>;
}
{
  const repository = new AuthSessionRepository(storageRoot);
  const captureFn = vi.fn(overrides?.capture ?? (async ({ storageStatePath }) => {
    await writeStateFile(storageStatePath);
  }));
  const validateFn = vi.fn(overrides?.validate ?? (async () => true));
  const service = new AuthSessionService(
    repository,
    captureFn as (input: { targetUrl: string; storageStatePath: string }) => Promise<void>,
    validateFn as (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>,
  );

  return { service, repository, captureFn, validateFn };
}

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-auth-service-'));
});

afterEach(async () => {
  if (storageRoot)
  {
    await rm(storageRoot, { recursive: true, force: true });
    storageRoot = '';
  }
});

describe('AuthSessionService.capture', () => {
  it('persists a ready record on a successful capture', async () => {
    const { service, captureFn } = createService();

    const record = await service.capture({ targetUrl: 'https://portal.bitrix24.ru/auth/' });

    expect(record).toMatchObject({
      host: 'portal.bitrix24.ru',
      status: 'ready',
      targetUrl: 'https://portal.bitrix24.ru/auth/',
    });
    expect(captureFn).toHaveBeenCalledTimes(1);
    expect(service.getForHost('portal.bitrix24.ru').status).toBe('ready');
  });

  it('marks the record as failed and keeps the error message when capture throws', async () => {
    const { service } = createService({
      capture: async () => {
        throw new Error('browser crashed');
      },
    });

    const record = await service.capture({ targetUrl: 'https://portal.bitrix24.ru/auth/' });

    expect(record).toMatchObject({
      host: 'portal.bitrix24.ru',
      status: 'failed',
      error: 'browser crashed',
    });
    expect(service.getForHost('portal.bitrix24.ru').status).toBe('failed');
  });

  it('rejects empty, missing, or non-URL targetUrls with a validation error', async () => {
    const { service } = createService();

    await expect(service.capture({})).rejects.toBeInstanceOf(AuthSessionValidationError);
    await expect(service.capture({ targetUrl: '' })).rejects.toBeInstanceOf(AuthSessionValidationError);
    await expect(service.capture({ targetUrl: '   ' })).rejects.toBeInstanceOf(AuthSessionValidationError);
    await expect(service.capture({ targetUrl: 'not a url' })).rejects.toBeInstanceOf(AuthSessionValidationError);
    await expect(service.capture(null)).rejects.toBeInstanceOf(AuthSessionValidationError);
  });
});

describe('AuthSessionService.ensureReadyForUrl', () => {
  it('throws Expired when no record exists for the host', async () => {
    const { service, validateFn } = createService();

    await expect(
      service.ensureReadyForUrl('https://portal.bitrix24.ru/page'),
    ).rejects.toBeInstanceOf(AuthSessionExpiredError);
    expect(validateFn).not.toHaveBeenCalled();
  });

  it('marks the record failed and throws Expired when validate returns false', async () => {
    const { service, validateFn } = createService({ validate: async () => false });
    await service.capture({ targetUrl: 'https://portal.bitrix24.ru/' });

    await expect(
      service.ensureReadyForUrl('https://portal.bitrix24.ru/blank.php'),
    ).rejects.toBeInstanceOf(AuthSessionExpiredError);

    expect(validateFn).toHaveBeenCalledTimes(1);
    const record = service.getForHost('portal.bitrix24.ru');
    expect(record).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('no longer valid'),
    });
  });

  it('returns the storage state path when the saved session still validates', async () => {
    const { service, repository } = createService();
    await service.capture({ targetUrl: 'https://portal.bitrix24.ru/' });

    const statePath = await service.ensureReadyForUrl('https://portal.bitrix24.ru/blank.php');

    expect(statePath).toBe(repository.getStateFilePath('portal.bitrix24.ru'));
  });
});
