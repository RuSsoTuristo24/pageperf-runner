import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Profile } from '@webperf/shared';
import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

import type { ProfileRepository, StoredProfile } from './profile.repository.types.js';

export type { StoredProfile } from './profile.repository.types.js';
export type { ProfileRepository } from './profile.repository.types.js';

function normalizeStoredProfile(
  profile: StoredProfile | (
    Omit<StoredProfile, 'authMode' | 'cacheMode'>
    & {
      authMode?: StoredProfile['authMode'];
      cacheMode?: StoredProfile['cacheMode'];
      pages?: StoredProfile['pages'];
    }
  ),
): StoredProfile
{
  return {
    ...profile,
    authMode: profile.authMode ?? 'none',
    cacheMode: profile.cacheMode ?? 'cold',
    pages: profile.pages?.length ? profile.pages : [profile.url],
    scheduled: profile.scheduled ?? false,
    cronExpression: profile.cronExpression ?? undefined,
  };
}

export class InMemoryProfileRepository implements ProfileRepository
{
  #profiles: StoredProfile[];

  readonly #storageFilePath?: string;

  constructor(storageRoot?: string)
  {
    this.#storageFilePath = storageRoot ? path.join(storageRoot, 'data', 'profiles.json') : undefined;
    this.#profiles = this.#storageFilePath
      ? readJsonFileSync<StoredProfile[]>(this.#storageFilePath, []).map((profile) => normalizeStoredProfile(profile))
      : [];
  }

  async create(profile: Omit<Profile, 'id'>): Promise<StoredProfile>
  {
    const stored: StoredProfile = {
      ...normalizeStoredProfile(profile),
      id: randomUUID(),
    };

    this.#profiles.push(stored);
    this.#persist();

    return stored;
  }

  async list(): Promise<StoredProfile[]>
  {
    return [...this.#profiles];
  }

  async findById(id: string): Promise<StoredProfile | null>
  {
    return this.#profiles.find((profile) => profile.id === id) ?? null;
  }

  async delete(id: string): Promise<boolean>
  {
    const index = this.#profiles.findIndex((profile) => profile.id === id);

    if (index === -1)
    {
      return false;
    }

    this.#profiles.splice(index, 1);
    this.#persist();

    return true;
  }

  #persist(): void
  {
    if (!this.#storageFilePath)
    {
      return;
    }

    writeJsonFileSync(this.#storageFilePath, this.#profiles);
  }
}
