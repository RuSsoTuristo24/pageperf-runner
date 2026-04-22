import { describe, expect, it } from 'vitest';

import { loadConfig, resolveArtifactRoot, throttlingProfiles } from './config.js';
import { issueSeveritySchema } from './domain/issue.js';
import { profileSchema } from './domain/profile.js';
import { requestSchema } from './domain/request.js';
import { runStatusSchema } from './domain/run.js';
import { parseEnv } from './env.js';

const validEnv = {
  PORT: '4310',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/pageperf_runner',
  ARTIFACT_ROOT: '.\\storage\\artifacts',
  CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
};

describe('shared config', () => {
  it('resolves artifact roots for Windows-style paths', () => {
    expect(resolveArtifactRoot('C:\\webperf\\artifacts')).toBe('C:\\webperf\\artifacts');
  });

  it('exposes built-in throttling presets', () => {
    expect(Object.keys(throttlingProfiles)).toEqual([
      'native',
      'slow-4g',
      'fast-3g',
      'slow-3g',
    ]);
  });

  it('parses all required env variables', () => {
    expect(parseEnv(validEnv)).toEqual({
      ...validEnv,
      PORT: 4310,
    });
  });

  it.each([
    'PORT',
    'DATABASE_URL',
    'ARTIFACT_ROOT',
    'CHROME_PATH',
  ] as const)('rejects missing %s', (key) => {
    const input = { ...validEnv, [key]: undefined };

    expect(() => parseEnv(input)).toThrow();
  });

  it('builds runtime config from validated env', () => {
    const config = loadConfig(validEnv);

    expect(config.port).toBe(4310);
    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
    expect(config.chromePath).toBe(validEnv.CHROME_PATH);
    expect(config.artifactRoot.endsWith('storage\\artifacts')).toBe(true);
  });
});

describe('shared schemas', () => {
  it('accepts known run statuses', () => {
    expect(runStatusSchema.parse('queued')).toBe('queued');
    expect(runStatusSchema.parse('completed')).toBe('completed');
  });

  it('accepts known issue severities', () => {
    expect(issueSeveritySchema.parse('warning')).toBe('warning');
    expect(issueSeveritySchema.parse('critical')).toBe('critical');
  });

  it('accepts expanded request metadata fields for network collection', () => {
    expect(requestSchema.parse({
      url: 'https://russeltest.bitrix24.ru/blank.php',
      method: 'GET',
      status: 200,
      resourceType: 'document',
      contentEncoding: 'gzip',
      fromDiskCache: false,
      fromMemoryCache: true,
      revalidated: false,
      transferSize: 70003,
      encodedBodySize: 69703,
      decodedBodySize: 275275,
      startTimeMs: 10,
      endTimeMs: 210,
      queueingMs: 4,
      dnsMs: 6,
      connectMs: 12,
      sslMs: 8,
      requestSentMs: 2,
      waitingMs: 150,
      downloadMs: 18,
      initiatorType: 'script',
      initiatorUrl: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
      redirectParentUrl: 'https://russeltest.bitrix24.ru/redirect.php',
      protocol: 'h2',
      priority: 'High',
    })).toMatchObject({
      status: 200,
      contentEncoding: 'gzip',
      fromMemoryCache: true,
      initiatorType: 'script',
      protocol: 'h2',
    });
  });

  it('accepts profiles that opt into a saved auth session', () => {
    expect(profileSchema.parse({
      name: 'Blank page secured',
      url: 'https://russeltest.bitrix24.ru/blank.php',
      throttling: 'native',
      authMode: 'session',
    })).toMatchObject({
      authMode: 'session',
    });
  });

  it('accepts profiles that request both cold and warm cache passes', () => {
    expect(profileSchema.parse({
      name: 'Blank page both cache',
      url: 'https://russeltest.bitrix24.ru/blank.php',
      pages: [
        'https://russeltest.bitrix24.ru/blank.php',
        'https://russeltest.bitrix24.ru/crm/lead/list/',
      ],
      throttling: 'native',
      cacheMode: 'both',
    })).toMatchObject({
      cacheMode: 'both',
    });
  });

  it('rejects profile pages from multiple origins', () => {
    expect(() => profileSchema.parse({
      name: 'Mixed origins',
      url: 'https://russeltest.bitrix24.ru/blank.php',
      pages: [
        'https://russeltest.bitrix24.ru/blank.php',
        'https://example.com/page',
      ],
      throttling: 'native',
    })).toThrow();
  });
});
