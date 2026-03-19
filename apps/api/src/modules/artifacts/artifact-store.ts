import { mkdir, rm, writeFile } from 'node:fs/promises';
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

    await mkdir(runDir, { recursive: true });
    await writeFile(targetPath, JSON.stringify(input.data, null, 2), 'utf8');

    return {
      kind: input.kind,
      path: targetPath,
    };
  }

  async deleteRunArtifacts(runId: string): Promise<void>
  {
    if (path.basename(runId) !== runId || runId.includes('..'))
    {
      throw new Error('Invalid run id');
    }

    await rm(path.resolve(this.root, runId), { recursive: true, force: true });
  }
}
