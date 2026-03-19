import { AuthSessionRepository, type AuthSessionRecord } from './auth-session.repository.js';

export class AuthSessionValidationError extends Error {}
export class AuthSessionExpiredError extends Error {}

export class AuthSessionService
{
  constructor(
    private readonly repository: AuthSessionRepository,
    private readonly captureSession: (input: { targetUrl: string; storageStatePath: string }) => Promise<void>,
    private readonly validateSession: (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>,
  )
  {
  }

  getStatus(): AuthSessionRecord
  {
    return this.repository.get();
  }

  getStateFilePath(): string
  {
    return this.repository.getStateFilePath();
  }

  async capture(input: unknown): Promise<AuthSessionRecord>
  {
    if (
      !input
      || typeof input !== 'object'
      || typeof (input as { targetUrl?: unknown }).targetUrl !== 'string'
      || (input as { targetUrl: string }).targetUrl.trim() === ''
    )
    {
      throw new AuthSessionValidationError('Invalid auth session payload');
    }

    const targetUrl = (input as { targetUrl: string }).targetUrl;

    this.repository.save({
      id: 'default',
      status: 'capturing',
      targetUrl,
      updatedAt: new Date().toISOString(),
    });

    try
    {
      await this.captureSession({
        targetUrl,
        storageStatePath: this.repository.getStateFilePath(),
      });

      return this.repository.save({
        id: 'default',
        status: 'ready',
        targetUrl,
        updatedAt: new Date().toISOString(),
      });
    }
    catch (error)
    {
      return this.repository.save({
        id: 'default',
        status: 'failed',
        targetUrl,
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Auth session capture failed',
      });
    }
  }

  async ensureReady(targetUrl?: string): Promise<string>
  {
    const session = this.getStatus();

    if (session.status !== 'ready')
    {
      throw new AuthSessionExpiredError('Auth session is not ready');
    }

    const effectiveTargetUrl = targetUrl ?? session.targetUrl;

    if (!effectiveTargetUrl)
    {
      throw new AuthSessionExpiredError('Saved auth session has no target URL');
    }

    const isValid = await this.validateSession({
      targetUrl: effectiveTargetUrl,
      storageStatePath: this.repository.getStateFilePath(),
    });

    if (!isValid)
    {
      this.repository.save({
        id: 'default',
        status: 'failed',
        targetUrl: effectiveTargetUrl,
        updatedAt: new Date().toISOString(),
        error: 'Saved auth session is no longer valid. Capture it again.',
      });

      throw new AuthSessionExpiredError('Saved auth session is no longer valid. Capture it again.');
    }

    return this.repository.getStateFilePath();
  }
}
