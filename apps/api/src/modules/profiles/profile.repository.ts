import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Profile } from '@webperf/shared';
import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

type StoredProfile = Profile & { id: string };

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
  };
}

export class InMemoryProfileRepository
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

  create(profile: Omit<Profile, 'id'>): StoredProfile
  {
    const stored: StoredProfile = {
      ...normalizeStoredProfile(profile),
      id: randomUUID(),
    };

    this.#profiles.push(stored);
    this.#persist();

    return stored;
  }

  list(): StoredProfile[]
  {
    return [...this.#profiles];
  }

  findById(id: string): StoredProfile | null
  {
    return this.#profiles.find((profile) => profile.id === id) ?? null;
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
