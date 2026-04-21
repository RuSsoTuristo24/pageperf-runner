import { describe, it, expect, vi } from 'vitest';
import { ArtifactCleanupService } from './artifact-cleanup.js';

describe('ArtifactCleanupService', () => {
  it('invokes store.deleteOlderThan with configured retention days', async () => {
    const store = { deleteOlderThan: vi.fn().mockResolvedValue(['run-old']) };
    const service = new ArtifactCleanupService(store as any, 30);

    const removed = await service.runOnce();

    expect(store.deleteOlderThan).toHaveBeenCalledWith(30);
    expect(removed).toEqual(['run-old']);
  });

  it('schedule() registers cron with given expression', () => {
    const store = { deleteOlderThan: vi.fn() };
    const schedule = vi.fn().mockReturnValue({ stop: vi.fn() });
    const service = new ArtifactCleanupService(store as any, 30, { schedule });

    service.schedule('0 3 1 * *');

    expect(schedule).toHaveBeenCalledWith('0 3 1 * *', expect.any(Function));
  });
});
