import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Profile } from '@pageperf-runner/shared';
import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

type StoredProfile = Profile & { id: string };

function normalizeStoredProfile(
  profile: StoredProfile | (
    Omit<StoredProfile, 'authMode' | 'cacheMode' | 'environment' | 'isTemplate'>
    & {
      authMode?: StoredProfile['authMode'];
      cacheMode?: StoredProfile['cacheMode'];
      environment?: StoredProfile['environment'];
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
    environment: profile.environment ?? 'production',
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

  update(id: string, patch: Partial<Omit<StoredProfile, 'id'>>): StoredProfile | null
  {
    const profile = this.#profiles.find((candidate) => candidate.id === id);

    if (!profile)
    {
      return null;
    }

    if (patch.name !== undefined) profile.name = patch.name;
    if (patch.url !== undefined) profile.url = patch.url;
    if (patch.throttling !== undefined) profile.throttling = patch.throttling;
    if (patch.authMode !== undefined) profile.authMode = patch.authMode;
    if (patch.cacheMode !== undefined) profile.cacheMode = patch.cacheMode;
    if (patch.environment !== undefined) profile.environment = patch.environment;
    if (patch.pages !== undefined) profile.pages = patch.pages.length ? patch.pages : [profile.url];
    if (patch.isTemplate !== undefined) profile.isTemplate = patch.isTemplate;

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
