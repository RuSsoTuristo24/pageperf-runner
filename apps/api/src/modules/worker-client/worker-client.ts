type FetchLike = typeof fetch;

export class WorkerClient
{
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {}

  async executeLiveRun(input: unknown): Promise<unknown>
  {
    return this.postJson('/run', input);
  }

  async captureAuthSession(input: { targetUrl: string; storageStatePath: string; chromePath?: string; timeoutMs?: number }): Promise<void>
  {
    await this.postJson('/capture-auth', input, { expectBody: false });
  }

  async validateAuthSession(input: { targetUrl: string; storageStatePath: string; chromePath?: string; timeoutMs?: number }): Promise<boolean>
  {
    const body = await this.postJson('/validate-auth', input) as { valid: boolean };
    return body.valid;
  }

  async refreshAuthSession(input: { targetUrl: string; storageStatePath: string; chromePath?: string; timeoutMs?: number }): Promise<boolean>
  {
    const body = await this.postJson('/refresh-auth', input) as { refreshed: boolean };
    return body.refreshed;
  }

  private async postJson(path: string, payload: unknown, opts: { expectBody?: boolean } = {}): Promise<unknown>
  {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    if (!res.ok)
    {
      const text = await res.text().catch(() => '');
      throw new Error(`worker ${path} ${res.status}: ${text}`);
    }
    if (opts.expectBody === false) return undefined;
    return res.json();
  }
}
