import { profileSchema, type Profile } from '@pageperf-runner/shared';

import type { Db } from '../../db/client.js';
import { pgInsertProfile, pgUpdateProfile, pgUpdateProfileTemplate } from '../../db/pg-ingest.js';

import { InMemoryProfileRepository } from './profile.repository.js';

export class ProfileValidationError extends Error {}

export class ProfileNotFoundError extends Error {}

export class ProfileService
{
  constructor(
    private readonly repository: InMemoryProfileRepository,
    private readonly db?: Db,
  )
  {
  }

  create(input: unknown): Profile & { id: string }
  {
    const parsed = profileSchema.safeParse(input);

    if (!parsed.success)
    {
      throw new ProfileValidationError(parsed.error.message);
    }

    const stored = this.repository.create({
      name: parsed.data.name,
      url: parsed.data.url,
      pages: parsed.data.pages ?? [parsed.data.url],
      throttling: parsed.data.throttling,
      authMode: parsed.data.authMode,
      cacheMode: parsed.data.cacheMode,
      environment: parsed.data.environment,
      isTemplate: parsed.data.isTemplate,
    });

    // Fire-and-forget dual-write to PG. Errors are swallowed by the helper —
    // web UI reads still come from InMemoryProfileRepository, this only
    // powers Grafana dashboards.
    void pgInsertProfile(this.db, {
      id: stored.id,
      name: stored.name,
      url: stored.url,
      throttling: stored.throttling,
      environment: stored.environment,
      isTemplate: stored.isTemplate,
    });

    return stored;
  }

  list(): Array<Profile & { id: string }>
  {
    return this.repository.list();
  }

  findById(id: string): (Profile & { id: string }) | null
  {
    return this.repository.findById(id);
  }

  setTemplate(id: string, isTemplate: boolean): Profile & { id: string }
  {
    const updated = this.repository.setTemplate(id, isTemplate);

    if (!updated)
    {
      throw new ProfileNotFoundError(`Profile ${id} not found`);
    }

    void pgUpdateProfileTemplate(this.db, id, isTemplate);

    return updated;
  }

  update(id: string, patch: unknown): Profile & { id: string }
  {
    if (!patch || typeof patch !== 'object')
    {
      throw new ProfileValidationError('patch payload must be an object');
    }

    const allowed: Partial<Profile> = {};
    const body = patch as Record<string, unknown>;

    if ('name' in body)
    {
      if (typeof body.name !== 'string' || !body.name.trim())
      {
        throw new ProfileValidationError('name must be a non-empty string');
      }
      allowed.name = body.name.trim();
    }

    if ('url' in body)
    {
      if (typeof body.url !== 'string' || !body.url.trim())
      {
        throw new ProfileValidationError('url must be a non-empty string');
      }
      allowed.url = body.url.trim();
    }

    if ('pages' in body)
    {
      if (!Array.isArray(body.pages) || body.pages.some((page) => typeof page !== 'string'))
      {
        throw new ProfileValidationError('pages must be an array of strings');
      }
      allowed.pages = (body.pages as string[]).map((page) => page.trim()).filter(Boolean);
    }

    if ('throttling' in body)
    {
      if (typeof body.throttling !== 'string')
      {
        throw new ProfileValidationError('throttling must be a string');
      }
      allowed.throttling = body.throttling;
    }

    if ('authMode' in body)
    {
      if (body.authMode !== 'none' && body.authMode !== 'session')
      {
        throw new ProfileValidationError('authMode must be "none" or "session"');
      }
      allowed.authMode = body.authMode;
    }

    if ('cacheMode' in body)
    {
      if (body.cacheMode !== 'cold' && body.cacheMode !== 'warm' && body.cacheMode !== 'both')
      {
        throw new ProfileValidationError('cacheMode must be "cold", "warm" or "both"');
      }
      allowed.cacheMode = body.cacheMode;
    }

    if ('environment' in body)
    {
      if (body.environment !== 'etalon' && body.environment !== 'production'
        && body.environment !== 'box' && body.environment !== 'experimental')
      {
        throw new ProfileValidationError('environment must be "etalon", "production", "box" or "experimental"');
      }
      allowed.environment = body.environment;
    }

    const updated = this.repository.update(id, allowed);

    if (!updated)
    {
      throw new ProfileNotFoundError(`Profile ${id} not found`);
    }

    // Mirror the patch to PG so Grafana sees the new environment / url / etc.
    const pgPatch: Parameters<typeof pgUpdateProfile>[2] = {};
    if (allowed.name !== undefined) pgPatch.name = allowed.name;
    if (allowed.url !== undefined) pgPatch.url = allowed.url;
    if (allowed.throttling !== undefined) pgPatch.throttling = allowed.throttling;
    if (allowed.environment !== undefined) pgPatch.environment = allowed.environment;
    if (Object.keys(pgPatch).length > 0)
    {
      void pgUpdateProfile(this.db, id, pgPatch);
    }

    return updated;
  }
}
