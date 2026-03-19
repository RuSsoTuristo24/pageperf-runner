import { describe, expect, it } from 'vitest';

import { summarizeJsExecution, summarizeTrace } from './trace-collector.js';

describe('trace collector', () => {
  it('builds a critical chain and main-thread buckets from trace events', () => {
    const summary = summarizeTrace([
      {
        name: 'ResourceSendRequest',
        duration: 281.7,
        url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
      },
      {
        name: 'EvaluateScript',
        duration: 84.9,
      },
      {
        name: 'CompileScript',
        duration: 14.2,
      },
      {
        name: 'Layout',
        duration: 23.1,
      },
      {
        name: 'Paint',
        duration: 10.2,
      },
      {
        name: 'RunTask',
        duration: 75.5,
      },
    ]);

    expect(summary).toEqual({
      criticalChain: [
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
          duration: 281.7,
        },
      ],
      mainThread: {
        parse: 14.2,
        evaluate: 84.9,
        layout: 23.1,
        paint: 10.2,
        other: 0,
        longTaskCount: 1,
        longTaskTotal: 75.5,
      },
      longTasks: [{ durationMs: 75.5, startMs: undefined, url: undefined }],
      layoutShifts: [],
      forcedReflows: [],
    });
  });

  it('collects individual long tasks with timestamps and script attribution', () => {
    const summary = summarizeTrace([
      { name: 'RunTask', duration: 120, ts: 1000 },
      { name: 'RunTask', duration: 30, ts: 2000 },
      { name: 'RunTask', duration: 75, ts: 3000, url: 'https://example.com/app.js' },
    ]);

    expect(summary.longTasks).toEqual([
      { durationMs: 120, startMs: 1000, url: undefined },
      { durationMs: 75, startMs: 3000, url: 'https://example.com/app.js' },
    ]);
    expect(summary.mainThread.longTaskCount).toBe(2);
  });

  it('collects layout shift events with score and sources', () => {
    const summary = summarizeTrace([
      {
        name: 'LayoutShift',
        duration: 0,
        ts: 500,
        layoutShiftValue: 0.12,
        layoutShiftSources: ['DIV.main-content'],
      },
      {
        name: 'LayoutShift',
        duration: 0,
        ts: 800,
        layoutShiftValue: 0.05,
      },
    ]);

    expect(summary.layoutShifts).toEqual([
      { value: 0.12, startMs: 500, sources: ['DIV.main-content'] },
      { value: 0.05, startMs: 800, sources: undefined },
    ]);
  });

  it('detects forced reflows from Layout events with stack traces', () => {
    const summary = summarizeTrace([
      { name: 'Layout', duration: 15, ts: 100, hasForcingStackTrace: true, url: 'https://example.com/app.js' },
      { name: 'Layout', duration: 8, ts: 200 },
      { name: 'UpdateLayoutTree', duration: 5, ts: 300, hasForcingStackTrace: true },
    ]);

    expect(summary.forcedReflows).toEqual([
      { durationMs: 15, startMs: 100, url: 'https://example.com/app.js' },
      { durationMs: 5, startMs: 300, url: undefined },
    ]);
    expect(summary.mainThread.layout).toBe(28);
  });

  it('builds a js execution summary with per-resource attribution and unattributed buckets', () => {
    const summary = summarizeJsExecution([
      {
        name: 'CompileScript',
        duration: 12,
        url: 'https://example.com/app.js',
        attributionConfidence: 'high',
      },
      {
        name: 'EvaluateScript',
        duration: 48,
        url: 'https://example.com/app.js',
        attributionConfidence: 'high',
      },
      {
        name: 'FunctionCall',
        duration: 9,
        url: 'https://example.com/vendor.js',
        attributionConfidence: 'medium',
      },
      {
        name: 'V8.Execute',
        duration: 6,
      },
    ]);

    expect(summary).toEqual({
      resources: [
        {
          url: 'https://example.com/app.js',
          parseMs: 12,
          evaluateMs: 48,
          totalMs: 60,
          attributionConfidence: 'high',
        },
        {
          url: 'https://example.com/vendor.js',
          parseMs: 0,
          evaluateMs: 9,
          totalMs: 9,
          attributionConfidence: 'medium',
        },
      ],
      unattributed: {
        parseMs: 0,
        evaluateMs: 6,
        totalMs: 6,
      },
    });
  });
});
