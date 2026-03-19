import { describe, expect, it } from 'vitest';

import { detectIssues } from './rule-engine.js';

describe('rule engine', () => {
  it('detects large decoded JS, missing compression, render-blocking CSS, and weak warm-cache improvement', () => {
    const issues = detectIssues({
      requests: [
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
          resourceType: 'script',
          decodedBodySize: 1118961,
          encodedBodySize: 281650,
          transferSize: 281950,
          contentEncoding: 'gzip',
          renderBlocking: false,
        },
        {
          url: 'https://russeltest.bitrix24.ru/space.jpg',
          resourceType: 'image',
          decodedBodySize: 242001,
          encodedBodySize: 242001,
          transferSize: 242300,
          contentEncoding: null,
          renderBlocking: false,
        },
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.css',
          resourceType: 'stylesheet',
          decodedBodySize: 433761,
          encodedBodySize: 126294,
          transferSize: 126500,
          contentEncoding: 'gzip',
          renderBlocking: true,
        },
      ],
      coldLoadMs: 9438.4,
      warmLoadMs: 9000,
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      'large-decoded-js',
      'missing-compression',
      'render-blocking-css',
      'weak-warm-cache-improvement',
    ]);
  });
});
