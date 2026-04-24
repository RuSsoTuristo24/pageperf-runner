import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Profile } from '@pageperf-runner/shared';
import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

type StoredProfile = Profile & { id: string };

function normalizeStoredProfile(
  profile: StoredProfile | (
    Omit<StoredProfile, 'authMode' | 'cacheMode' | 'isTemplate'>
    & {
      authMode?: StoredProfile['authMode'];
      cacheMode?: StoredProfile['cacheMode'];
      pages?: StoredProfile['pages'];
      isTemplate?: StoredProfile['isTemplate'];
    }
  ),
): StoredProfile
{
  return {
    ...profile,
    authMode: profile.authMode ?? 'none',
    cacheMode: profile.cacheMode ?? 'cold',
    pages: profile.pages?.length ? profile.pages : [profile.url],
    isTemplate: profile.isTemplate ?? false,
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

  setTemplate(id: string, isTemplate: boolean): StoredProfile | null
  {
    const profile = this.#profiles.find((candidate) => candidate.id === id);

    if (!profile)
    {
      return null;
    }

    profile.isTemplate = isTemplate;
    this.#persist();

    return profile;
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
