import { describe, expect, it } from 'vitest';

import { summarizeCoverage } from './coverage-collector.js';

describe('coverage collector', () => {
  it('summarizes JS and CSS used versus unused bytes', () => {
    const summary = summarizeCoverage([
      {
        url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
        type: 'js',
        totalBytes: 245644,
        usedBytes: 120000,
      },
      {
        url: 'https://russeltest.bitrix24.ru/bitrix/templates/bitrix24/dist/bitrix24.bundle.min.css',
        type: 'css',
        totalBytes: 59363,
        usedBytes: 42000,
      },
    ]);

    expect(summary).toEqual({
      totals: {
        js: { usedBytes: 120000, unusedBytes: 125644 },
        css: { usedBytes: 42000, unusedBytes: 17363 },
      },
      resources: [
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
          type: 'js',
          usedBytes: 120000,
          unusedBytes: 125644,
        },
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/templates/bitrix24/dist/bitrix24.bundle.min.css',
          type: 'css',
          usedBytes: 42000,
          unusedBytes: 17363,
        },
      ],
    });
  });
});
