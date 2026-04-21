import * as nodeCron from 'node-cron';

import type { ArtifactStore } from './artifact-store.js';

type CronLib = { schedule: typeof nodeCron.schedule };

type StoreLike = Pick<ArtifactStore, 'deleteOlderThan'>;

export class ArtifactCleanupService
{
  private task: { stop: () => void } | null = null;

  constructor(
    private readonly store: StoreLike,
    private readonly retentionDays: number,
    private readonly cronLib: CronLib = nodeCron,
  ) {}

  async runOnce(): Promise<string[]>
  {
    return this.store.deleteOlderThan(this.retentionDays);
  }

  schedule(expression: string): void
  {
    this.task = this.cronLib.schedule(expression, () => {
      this.runOnce().catch((err) => {
        console.error('[artifact-cleanup] failed:', err);
      });
    }) as unknown as { stop: () => void };
  }

  stop(): void
  {
    this.task?.stop();
    this.task = null;
  }
}
