import { eq } from 'drizzle-orm';

import type { Profile } from '@webperf/shared';
import type { Database } from '../../db/drizzle.js';
import { profiles } from '../../db/schema.js';
import type { ProfileRepository, StoredProfile } from './profile.repository.types.js';

function toStoredProfile(row: typeof profiles.$inferSelect): StoredProfile
{
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    throttling: row.throttling,
    authMode: row.authMode as StoredProfile['authMode'],
    cacheMode: row.cacheMode as StoredProfile['cacheMode'],
    pages: (row.pages as string[]) ?? [],
    repeatCount: row.repeatCount,
    scheduled: row.scheduled,
    cronExpression: row.cronExpression ?? undefined,
  };
}

export class PgProfileRepository implements ProfileRepository
{
  constructor(private readonly db: Database) {}

  async create(input: Omit<Profile, 'id'>): Promise<StoredProfile>
  {
    const pages = input.pages?.length ? input.pages : [input.url];
    const [row] = await this.db.insert(profiles).values({
      name: input.name,
      url: input.url,
      throttling: input.throttling ?? 'native',
      authMode: input.authMode ?? 'none',
      cacheMode: input.cacheMode ?? 'cold',
      pages,
      repeatCount: input.repeatCount ?? 1,
      scheduled: input.scheduled ?? false,
      cronExpression: input.cronExpression ?? null,
    }).returning();

    return toStoredProfile(row);
  }

  async list(): Promise<StoredProfile[]>
  {
    const rows = await this.db.select().from(profiles).orderBy(profiles.createdAt);

    return rows.map(toStoredProfile);
  }

  async findById(id: string): Promise<StoredProfile | null>
  {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.id, id));

    return row ? toStoredProfile(row) : null;
  }

  async delete(id: string): Promise<boolean>
  {
    const result = await this.db.delete(profiles).where(eq(profiles.id, id)).returning();

    return result.length > 0;
  }
}
