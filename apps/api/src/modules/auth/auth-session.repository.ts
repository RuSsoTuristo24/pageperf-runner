import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import type { AuthSessionRecord, AuthSessionStatus } from '@pageperf-runner/shared';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

// Type of the pre-per-host record. Kept here only for legacy migration.
type LegacyRecord = {
  id: 'default';
  status: AuthSessionStatus;
  targetUrl?: string;
  updatedAt?: string;
  error?: string;
};

function hashHost(host: string): string
{
  return createHash('sha1').update(host).digest('hex').slice(0, 12);
}

export class AuthSessionRepository
{
  readonly #registryPath: string;

  readonly #storageRoot: string;

  #records: Map<string, AuthSessionRecord> = new Map();

  constructor(storageRoot: string)
  {
    this.#storageRoot = storageRoot;
    this.#registryPath = path.join(storageRoot, 'data', 'auth', 'sessions.json');
    this.#loadFromDisk();
    this.#migrateLegacyIfPresent();
  }

  getStateFilePath(host: string): string
  {
    return path.join(this.#storageRoot, 'auth', `${hashHost(host)}.json`);
  }

  list(): AuthSessionRecord[]
  {
    return [...this.#records.values()].sort((a, b) => a.host.localeCompare(b.host));
  }

  get(host: string): AuthSessionRecord | null
  {
    const record = this.#records.get(host);
    if (!record)
    {
      return null;
    }

    // Self-heal: if registry says ready but the state file is gone
    // (disk cleanup, manual delete), demote to missing so callers
    // don't hand a stale path to Playwright.
    if (record.status === 'ready' && !existsSync(this.getStateFilePath(host)))
    {
      const repaired: AuthSessionRecord = { ...record, status: 'missing' };
      this.#records.set(host, repaired);
      this.#persist();

      return { ...repaired };
    }

    return { ...record };
  }

  save(record: AuthSessionRecord): AuthSessionRecord
  {
    this.#records.set(record.host, { ...record });
    this.#persist();

    return { ...record };
  }

  delete(host: string): void
  {
    const existed = this.#records.delete(host);
    if (!existed)
    {
      return;
    }

    const statePath = this.getStateFilePath(host);
    if (existsSync(statePath))
    {
      unlinkSync(statePath);
    }

    this.#persist();
  }

  #loadFromDisk(): void
  {
    const raw = readJsonFileSync<AuthSessionRecord[]>(this.#registryPath, []);
    this.#records = new Map(raw.map((record) => [record.host, record]));
  }

  #persist(): void
  {
    writeJsonFileSync(this.#registryPath, this.list());
  }

  // Legacy: pre-per-host layout kept one record in data/auth/session.json
  // plus its state in auth/default.json. If we find them, migrate once —
  // host from the legacy targetUrl — then remove legacy files so the
  // migration doesn't run again on restart.
  #migrateLegacyIfPresent(): void
  {
    const legacyRegistry = path.join(this.#storageRoot, 'data', 'auth', 'session.json');
    const legacyState = path.join(this.#storageRoot, 'auth', 'default.json');

    if (!existsSync(legacyRegistry) && !existsSync(legacyState))
    {
      return;
    }

    const legacy = readJsonFileSync<LegacyRecord | null>(legacyRegistry, null);
    const targetUrl = legacy?.targetUrl;

    if (legacy && targetUrl)
    {
      try
      {
        const host = new URL(targetUrl).host;
        const newStatePath = this.getStateFilePath(host);

        if (existsSync(legacyState) && !existsSync(newStatePath))
        {
          mkdirSync(path.dirname(newStatePath), { recursive: true });
          renameSync(legacyState, newStatePath);
        }

        this.#records.set(host, {
          host,
          status: legacy.status,
          targetUrl,
          updatedAt: legacy.updatedAt,
          error: legacy.error,
        });
        this.#persist();
      }
      catch
      {
        // invalid URL — fall through to cleanup
      }
    }

    if (existsSync(legacyRegistry))
    {
      unlinkSync(legacyRegistry);
    }
    if (existsSync(legacyState))
    {
      unlinkSync(legacyState);
    }
  }
}
