import { hostFromUrl, type AuthSessionRecord } from '@pageperf-runner/shared';

import { AuthSessionRepository } from './auth-session.repository.js';

export class AuthSessionValidationError extends Error {}
export class AuthSessionExpiredError extends Error {}
export class AuthSessionNotFoundError extends Error {}

type CaptureFn = (input: { targetUrl: string; storageStatePath: string }) => Promise<void>;
type ValidateFn = (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>;

function parseCaptureInput(input: unknown): string
{
  if (
    !input
    || typeof input !== 'object'
    || typeof (input as { targetUrl?: unknown }).targetUrl !== 'string'
    || (input as { targetUrl: string }).targetUrl.trim() === ''
  )
  {
    throw new AuthSessionValidationError('Invalid auth session payload: targetUrl required');
  }

  const targetUrl = (input as { targetUrl: string }).targetUrl;

  try
  {
    hostFromUrl(targetUrl);
  }
  catch
  {
    throw new AuthSessionValidationError(`Invalid targetUrl: ${targetUrl}`);
  }

  return targetUrl;
}

export class AuthSessionService
{
  constructor(
    private readonly repository: AuthSessionRepository,
    private readonly captureSession: CaptureFn,
    private readonly validateSession: ValidateFn,
  )
  {
  }

  list(): AuthSessionRecord[]
  {
    return this.repository.list();
  }

  getForHost(host: string): AuthSessionRecord
  {
    return this.repository.get(host) ?? {
      host,
      status: 'missing',
    };
  }

  delete(host: string): void
  {
    this.repository.delete(host);
  }

  async capture(input: unknown): Promise<AuthSessionRecord>
  {
    const targetUrl = parseCaptureInput(input);
    const host = hostFromUrl(targetUrl);
    const storageStatePath = this.repository.getStateFilePath(host);

    this.repository.save({
      host,
      status: 'capturing',
      targetUrl,
      updatedAt: new Date().toISOString(),
    });

    try
    {
      await this.captureSession({ targetUrl, storageStatePath });

      return this.repository.save({
        host,
        status: 'ready',
        targetUrl,
        updatedAt: new Date().toISOString(),
      });
    }
    catch (error)
    {
      return this.repository.save({
        host,
        status: 'failed',
        targetUrl,
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Auth session capture failed',
      });
    }
  }

  // Called by RunService right before a run starts.
  // Resolves host from the run's profile URL, validates the saved session is
  // still fresh, returns the storage state file path for the worker.
  async ensureReadyForUrl(profileUrl: string): Promise<string>
  {
    const host = hostFromUrl(profileUrl);
    const session = this.repository.get(host);

    if (!session || session.status !== 'ready')
    {
      throw new AuthSessionExpiredError(
        `No ready auth session for host ${host}. Capture one first.`,
      );
    }

    const storageStatePath = this.repository.getStateFilePath(host);
    const effectiveTargetUrl = session.targetUrl ?? profileUrl;

    const isValid = await this.validateSession({
      targetUrl: effectiveTargetUrl,
      storageStatePath,
    });

    if (!isValid)
    {
      this.repository.save({
        host,
        status: 'failed',
        targetUrl: effectiveTargetUrl,
        updatedAt: new Date().toISOString(),
        error: 'Saved auth session is no longer valid. Capture it again.',
      });

      throw new AuthSessionExpiredError(
        `Saved auth session for ${host} is no longer valid. Capture it again.`,
      );
    }

    return storageStatePath;
  }
}
