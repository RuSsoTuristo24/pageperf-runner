import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ArtifactStore } from './artifact-store.js';

describe('ArtifactStore', () => {
  let root: string;
  let store: ArtifactStore;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'artifact-store-'));
    store = new ArtifactStore(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writeJsonArtifact returns relative path under root', async () => {
    const rec = await store.writeJsonArtifact({
      runId: 'run-1',
      kind: 'trace',
      fileName: 'trace.json',
      data: { foo: 1 },
    });
    expect(rec.path).toBe(path.join('run-1', 'trace.json'));
    expect(existsSync(path.join(root, 'run-1', 'trace.json'))).toBe(true);
  });

  it('streamArtifact reads file under root by relative path', async () => {
    await store.writeJsonArtifact({
      runId: 'run-2',
      kind: 'trace',
      fileName: 'file.json',
      data: { bar: 2 },
    });
    const stream = await store.streamArtifact(path.join('run-2', 'file.json'));
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    expect(parsed).toEqual({ bar: 2 });
  });

  it('streamArtifact rejects traversal attempts', async () => {
    await expect(store.streamArtifact('../../etc/passwd')).rejects.toThrow(/path/i);
    await expect(store.streamArtifact('run-1/../../../etc/passwd')).rejects.toThrow(/path/i);
  });

  it('streamArtifact rejects absolute paths', async () => {
    await expect(store.streamArtifact('/etc/passwd')).rejects.toThrow(/path/i);
  });

  it('deleteOlderThan removes directories older than threshold', async () => {
    await store.writeJsonArtifact({
      runId: 'old-run',
      kind: 'trace',
      fileName: 'a.json',
      data: {},
    });
    await store.writeJsonArtifact({
      runId: 'new-run',
      kind: 'trace',
      fileName: 'a.json',
      data: {},
    });
    // Backdate old-run mtime
    const { utimesSync } = await import('node:fs');
    const oldTime = new Date(Date.now() - 100 * 86400_000);
    utimesSync(path.join(root, 'old-run'), oldTime, oldTime);

    const removed = await store.deleteOlderThan(30);
    expect(removed).toEqual(['old-run']);
    expect(existsSync(path.join(root, 'old-run'))).toBe(false);
    expect(existsSync(path.join(root, 'new-run'))).toBe(true);
  });

  it('rejects path traversal in fileName', async () => {
    await expect(() =>
      store.writeJsonArtifact({
        runId: 'run-1',
        kind: 'summary',
        fileName: '..\\evil.json',
        data: { ok: true },
      }),
    ).rejects.toThrow('Invalid artifact file name');
  });

  it('rejects run ids with path traversal segments', async () => {
    await expect(() =>
      store.writeJsonArtifact({
        runId: '..\\outside',
        kind: 'summary',
        fileName: 'summary.json',
        data: { ok: true },
      }),
    ).rejects.toThrow('Invalid run id');
  });
});
