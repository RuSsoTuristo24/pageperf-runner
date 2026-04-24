import { profileSchema, type Profile } from '@pageperf-runner/shared';

import type { Db } from '../../db/client.js';
import { pgInsertProfile, pgUpdateProfileTemplate } from '../../db/pg-ingest.js';

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
}
