import { profileSchema, type Profile } from '@webperf/shared';

import { InMemoryProfileRepository } from './profile.repository.js';

export class ProfileValidationError extends Error {}

export class ProfileService
{
  constructor(private readonly repository: InMemoryProfileRepository)
  {
  }

  create(input: unknown): Profile & { id: string }
  {
    const parsed = profileSchema.safeParse(input);

    if (!parsed.success)
    {
      throw new ProfileValidationError(parsed.error.message);
    }

    return this.repository.create({
      name: parsed.data.name,
      url: parsed.data.url,
      pages: parsed.data.pages ?? [parsed.data.url],
      throttling: parsed.data.throttling,
      authMode: parsed.data.authMode,
      cacheMode: parsed.data.cacheMode,
    });
  }

  list(): Array<Profile & { id: string }>
  {
    return this.repository.list();
  }

  findById(id: string): (Profile & { id: string }) | null
  {
    return this.repository.findById(id);
  }
}
