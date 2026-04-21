import { describe, it, expect, vi } from 'vitest';

// We test contract indirectly: mock playwright, assert launchBrowser receives chromePath
// and storageState is called with indexedDB: true.

vi.mock('playwright', () => {
  const storageState = vi.fn().mockResolvedValue(undefined);
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    url: () => 'https://example.bitrix24.com/',
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    storageState,
    close: vi.fn(),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn(),
  };
  const launch = vi.fn().mockResolvedValue(browser);
  return {
    chromium: { launch },
    __internals: { launch, storageState, context },
  };
});

import * as playwrightMock from 'playwright';
import { captureAuthSession, validateAuthSession } from './auth-session.js';

describe('auth-session chromePath propagation', () => {
  it('captureAuthSession passes chromePath to launchBrowser', async () => {
    const { __internals } = playwrightMock as any;
    __internals.launch.mockClear();

    await captureAuthSession({
      targetUrl: 'https://example.bitrix24.com/',
      storageStatePath: '/tmp/storage.json',
      chromePath: '/custom/chrome',
    });

    expect(__internals.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/custom/chrome', headless: false }),
    );
  });

  it('captureAuthSession calls storageState with indexedDB: true', async () => {
    const { __internals } = playwrightMock as any;
    __internals.storageState.mockClear();

    await captureAuthSession({
      targetUrl: 'https://example.bitrix24.com/',
      storageStatePath: '/tmp/storage.json',
    });

    expect(__internals.storageState).toHaveBeenCalledWith(
      expect.objectContaining({ indexedDB: true }),
    );
  });

  it('validateAuthSession passes chromePath to launchBrowser', async () => {
    const { __internals } = playwrightMock as any;
    __internals.launch.mockClear();

    // storageState file existence check: create temp file
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const nodePath = await import('node:path');
    const dir = tmpdir();
    const storagePath = nodePath.join(dir, 'existing-state.json');
    try { mkdirSync(dir, { recursive: true }); } catch {}
    writeFileSync(storagePath, '{}');

    await validateAuthSession({
      targetUrl: 'https://example.bitrix24.com/',
      storageStatePath: storagePath,
      chromePath: '/custom/chrome',
    });

    expect(__internals.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/custom/chrome', headless: true }),
    );
  });
});
