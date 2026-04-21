import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';

const execFileAsync = promisify(execFile);

export async function checkWorkerHealth(chromePath: string, display: string): Promise<{ ok: boolean; xvfb: boolean; chrome: boolean }>
{
  // Chrome binary exists
  const chrome = existsSync(chromePath);

  // Xvfb display alive: xdpyinfo -display :99 exits 0 when display is up.
  let xvfb = false;
  try
  {
    await execFileAsync('xdpyinfo', ['-display', display], { timeout: 3000 });
    xvfb = true;
  }
  catch
  {
    xvfb = false;
  }

  return { ok: chrome && xvfb, chrome, xvfb };
}
