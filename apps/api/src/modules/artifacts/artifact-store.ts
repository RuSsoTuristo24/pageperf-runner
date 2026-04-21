import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

type WriteJsonArtifactInput = {
  runId: string;
  kind: string;
  fileName: string;
  data: unknown;
};

type ArtifactRecord = {
  kind: string;
  path: string;
};

export class ArtifactStore
{
  constructor(private readonly root: string)
  {
  }

  async writeJsonArtifact(input: WriteJsonArtifactInput): Promise<ArtifactRecord>
  {
    if (path.basename(input.runId) !== input.runId || input.runId.includes('..'))
    {
      throw new Error('Invalid run id');
    }

    if (path.basename(input.fileName) !== input.fileName || input.fileName.includes('..'))
    {
      throw new Error('Invalid artifact file name');
    }

    const runDir = path.resolve(this.root, input.runId);
    const targetPath = path.join(runDir, input.fileName);
    const relativePath = path.join(input.runId, input.fileName);

    await mkdir(runDir, { recursive: true });
    await writeFile(targetPath, JSON.stringify(input.data, null, 2), 'utf8');

    return {
      kind: input.kind,
      path: relativePath,
    };
  }

  async streamArtifact(relativePath: string): Promise<ReadStream>
  {
    if (path.isAbsolute(relativePath))
    {
      throw new Error('Invalid artifact path: must be relative');
    }
    const resolved = path.resolve(this.root, relativePath);
    const normalizedRoot = path.resolve(this.root);
    if (!resolved.startsWith(normalizedRoot + path.sep))
    {
      throw new Error('Invalid artifact path: escapes root');
    }
    return createReadStream(resolved);
  }

  async deleteRunArtifacts(runId: string): Promise<void>
  {
    if (path.basename(runId) !== runId || runId.includes('..'))
    {
      throw new Error('Invalid run id');
    }

    await rm(path.resolve(this.root, runId), { recursive: true, force: true });
  }

  async deleteOlderThan(thresholdDays: number): Promise<string[]>
  {
    const now = Date.now();
    const maxAgeMs = thresholdDays * 86400_000;
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    const removed: string[] = [];
    for (const entry of entries)
    {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(this.root, entry.name);
      const st = await stat(dirPath);
      if (now - st.mtimeMs > maxAgeMs)
      {
        await rm(dirPath, { recursive: true, force: true });
        removed.push(entry.name);
      }
    }
    return removed;
  }
}
