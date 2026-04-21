import path from 'node:path';
import { existsSync } from 'node:fs';

import { launchBrowser } from './browser-launcher.js';

type CaptureAuthSessionInput = {
  targetUrl: string;
  storageStatePath: string;
  timeoutMs?: number;
  chromePath?: string;
};

function isAuthorizedTargetUrl(currentUrl: URL, targetUrl: URL): boolean
{
  return currentUrl.hostname === targetUrl.hostname;
}

export async function captureAuthSession(input: CaptureAuthSessionInput): Promise<void>
{
  const browser = await launchBrowser({ headless: false, chromePath: input.chromePath });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const targetUrl = new URL(input.targetUrl);

  try
  {
    await page.goto(input.targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForURL((url) => isAuthorizedTargetUrl(url, targetUrl), {
      timeout: input.timeoutMs ?? 300000,
    });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);

    await context.storageState({
      path: path.resolve(input.storageStatePath),
      indexedDB: true,
    });
  }
  finally
  {
    await browser.close();
  }
}

type ValidateAuthSessionInput = {
  targetUrl: string;
  storageStatePath: string;
  timeoutMs?: number;
  chromePath?: string;
};

export async function validateAuthSession(input: ValidateAuthSessionInput): Promise<boolean>
{
  if (!existsSync(input.storageStatePath))
  {
    return false;
  }

  const browser = await launchBrowser({ chromePath: input.chromePath });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    storageState: path.resolve(input.storageStatePath),
  });
  const page = await context.newPage();
  const targetUrl = new URL(input.targetUrl);

  try
  {
    await page.goto(input.targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForLoadState('networkidle', { timeout: input.timeoutMs ?? 10000 }).catch(() => undefined);

    return isAuthorizedTargetUrl(new URL(page.url()), targetUrl);
  }
  catch
  {
    return false;
  }
  finally
  {
    await browser.close();
  }
}
