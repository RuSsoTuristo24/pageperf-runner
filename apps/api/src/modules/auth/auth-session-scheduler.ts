import * as nodeCron from 'node-cron';

import type { AuthSessionService } from './auth-session.service.js';

type CronLib = { schedule: typeof nodeCron.schedule };

// Walks every saved ready-session and kicks a refresh. Silent: success or
// failure both land in the session's updatedAt/status (handled by the
// service). Never throws — the scheduler just keeps ticking.
export class AuthSessionScheduler
{
  private task: { stop: () => void } | null = null;

  constructor(
    private readonly service: AuthSessionService,
    private readonly cronLib: CronLib = nodeCron,
  ) {}

  async runOnce(): Promise<{ refreshed: number; failed: number }>
  {
    let refreshed = 0;
    let failed = 0;

    const sessions = this.service.list();
    for (const session of sessions)
    {
      if (session.status !== 'ready')
      {
        continue;
      }

      const ok = await this.service.refresh(session.host);
      if (ok)
      {
        refreshed += 1;
      }
      else
      {
        failed += 1;
      }
    }

    return { refreshed, failed };
  }

  schedule(expression: string): void
  {
    this.task = this.cronLib.schedule(expression, () => {
      this.runOnce().catch((err) => {
        console.error('[auth-refresh] scheduler failed:', err);
      });
    }) as unknown as { stop: () => void };
  }

  stop(): void
  {
    this.task?.stop();
    this.task = null;
  }
}
