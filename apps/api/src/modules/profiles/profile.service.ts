import { profileSchema, type Profile } from '@webperf/shared';

import type { ProfileRepository } from './profile.repository.types.js';

export class ProfileValidationError extends Error {}

export class ProfileService
{
  constructor(private readonly repository: ProfileRepository)
  {
  }

  async create(input: unknown): Promise<Profile & { id: string }>
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
      repeatCount: parsed.data.repeatCount,
    });
  }

  async list(): Promise<Array<Profile & { id: string }>>
  {
    return this.repository.list();
  }

  async findById(id: string): Promise<(Profile & { id: string }) | null>
  {
    return this.repository.findById(id);
  }

  async delete(id: string): Promise<boolean>
  {
    return this.repository.delete(id);
  }
}
