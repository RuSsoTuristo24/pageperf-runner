import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { resolveChromePath } from './browser-launcher.js';

describe('resolveChromePath', () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env.CHROME_PATH;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalEnv === undefined) {
      delete process.env.CHROME_PATH;
    } else {
      process.env.CHROME_PATH = originalEnv;
    }
  });

  beforeEach(() => {
    delete process.env.CHROME_PATH;
  });

  it('prefers input.chromePath when provided', () => {
    expect(resolveChromePath({ chromePath: '/custom/chrome' })).toBe('/custom/chrome');
  });

  it('uses CHROME_PATH env var when input path is absent', () => {
    process.env.CHROME_PATH = '/env/chrome';
    expect(resolveChromePath({})).toBe('/env/chrome');
  });

  it('defaults to /usr/bin/google-chrome on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(resolveChromePath({})).toBe('/usr/bin/google-chrome');
  });

  it('defaults to Windows chrome.exe path on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(resolveChromePath({})).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  });

  it('env wins over platform default', () => {
    process.env.CHROME_PATH = '/env/wins';
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(resolveChromePath({})).toBe('/env/wins');
  });

  it('createLaunchOptions on Linux adds --no-sandbox and --disable-dev-shm-usage', async () => {
    const { createLaunchOptions } = await import('./browser-launcher.js');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const opts = createLaunchOptions({});
    expect(opts.args).toContain('--no-sandbox');
    expect(opts.args).toContain('--disable-dev-shm-usage');
  });

  it('createLaunchOptions on win32 does not add sandbox args', async () => {
    const { createLaunchOptions } = await import('./browser-launcher.js');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const opts = createLaunchOptions({});
    expect(opts.args).not.toContain('--no-sandbox');
  });
});
