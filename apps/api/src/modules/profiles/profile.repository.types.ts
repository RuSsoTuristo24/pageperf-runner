import type { Profile } from '@webperf/shared';

export type StoredProfile = Profile & { id: string };

export interface ProfileRepository
{
  create(profile: Omit<Profile, 'id'>): Promise<StoredProfile>;
  list(): Promise<StoredProfile[]>;
  findById(id: string): Promise<StoredProfile | null>;
  delete(id: string): Promise<boolean>;
}
