import { describe, it, expect, vi } from 'vitest';
import { WorkerClient } from './worker-client.js';

describe('WorkerClient', () => {
  it('executeLiveRun POSTs /run and returns json', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ metrics: { lcpMs: 100 } }),
    });
    const client = new WorkerClient('http://worker:4311', fetch as any);

    const res = await client.executeLiveRun({ runId: 'r', url: 'u', storageStatePath: 's' });

    expect(fetch).toHaveBeenCalledWith('http://worker:4311/run', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
    }));
    expect(res).toEqual({ metrics: { lcpMs: 100 } });
  });

  it('captureAuthSession POSTs /capture-auth and returns void', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    const client = new WorkerClient('http://worker:4311', fetch as any);

    await client.captureAuthSession({ targetUrl: 'https://x', storageStatePath: '/s' });

    expect(fetch).toHaveBeenCalledWith('http://worker:4311/capture-auth', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('validateAuthSession returns boolean from response', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    });
    const client = new WorkerClient('http://worker:4311', fetch as any);

    const valid = await client.validateAuthSession({ targetUrl: 'https://x', storageStatePath: '/s' });

    expect(valid).toBe(true);
  });

  it('throws on non-ok responses', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    const client = new WorkerClient('http://worker:4311', fetch as any);

    await expect(
      client.executeLiveRun({ runId: 'r', url: 'u', storageStatePath: 's' }),
    ).rejects.toThrow(/500|boom/);
  });
});
