import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from './artifact-store.js';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('ArtifactStore', () => {
  it('creates a per-run directory and writes a json artifact', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'webperf-artifacts-'));
    tempDirs.push(root);

    const store = new ArtifactStore(root);
    const record = await store.writeJsonArtifact({
      runId: 'run-1',
      kind: 'summary',
      fileName: 'summary.json',
      data: { ok: true },
    });

    expect(record.kind).toBe('summary');
    expect(record.path.endsWith(path.join('run-1', 'summary.json'))).toBe(true);
  });

  it('rejects path traversal attempts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'webperf-artifacts-'));
    tempDirs.push(root);

    const store = new ArtifactStore(root);

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
    const root = await mkdtemp(path.join(os.tmpdir(), 'webperf-artifacts-'));
    tempDirs.push(root);

    const store = new ArtifactStore(root);

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
