export type RawTraceEntry = {
  name: string;
  duration: number;
  url?: string;
  attributionConfidence?: 'high' | 'medium' | 'low';
  ts?: number;
  layoutShiftValue?: number;
  layoutShiftSources?: string[];
  hasForcingStackTrace?: boolean;
};

export type JsExecutionSummary = {
  resources: Array<{
    url: string;
    parseMs: number;
    evaluateMs: number;
    totalMs: number;
    attributionConfidence: 'high' | 'medium' | 'low';
  }>;
  unattributed: {
    parseMs: number;
    evaluateMs: number;
    totalMs: number;
  };
};

export type TraceSummary = {
  criticalChain: Array<{
    url: string;
    duration: number;
  }>;
  mainThread: {
    parse: number;
    evaluate: number;
    layout: number;
    paint: number;
    other: number;
    longTaskCount: number;
    longTaskTotal: number;
  };
  longTasks: Array<{
    durationMs: number;
    startMs?: number;
    url?: string;
  }>;
  layoutShifts: Array<{
    value: number;
    startMs?: number;
    sources?: string[];
  }>;
  forcedReflows: Array<{
    durationMs: number;
    startMs?: number;
    url?: string;
  }>;
};

function isEvaluateEntry(name: string): boolean
{
  return name === 'EvaluateScript' || name === 'FunctionCall' || name === 'V8.Execute';
}

function isParseEntry(name: string): boolean
{
  return name === 'CompileScript' || name === 'V8.CompileCode';
}

function toConfidenceRank(value: RawTraceEntry['attributionConfidence']): number
{
  if (value === 'high')
  {
    return 3;
  }

  if (value === 'medium')
  {
    return 2;
  }

  if (value === 'low')
  {
    return 1;
  }

  return 0;
}

function fromConfidenceRank(value: number): 'high' | 'medium' | 'low'
{
  if (value >= 3)
  {
    return 'high';
  }

  if (value >= 2)
  {
    return 'medium';
  }

  return 'low';
}

export function summarizeTrace(entries: RawTraceEntry[]): TraceSummary
{
  const summary: TraceSummary = {
    criticalChain: [],
    mainThread: {
      parse: 0,
      evaluate: 0,
      layout: 0,
      paint: 0,
      other: 0,
      longTaskCount: 0,
      longTaskTotal: 0,
    },
    longTasks: [],
    layoutShifts: [],
    forcedReflows: [],
  };

  for (const entry of entries)
  {
    if (entry.url && entry.name === 'ResourceSendRequest')
    {
      summary.criticalChain.push({
        url: entry.url,
        duration: entry.duration,
      });
    }

    if (isEvaluateEntry(entry.name))
    {
      summary.mainThread.evaluate += entry.duration;
    }
    else if (isParseEntry(entry.name))
    {
      summary.mainThread.parse += entry.duration;
    }
    else if (entry.name === 'Layout' || entry.name === 'UpdateLayoutTree')
    {
      summary.mainThread.layout += entry.duration;
      if (entry.hasForcingStackTrace)
      {
        summary.forcedReflows.push({
          durationMs: entry.duration,
          startMs: entry.ts,
          url: entry.url,
        });
      }
    }
    else if (entry.name === 'Paint' || entry.name === 'CompositeLayers')
    {
      summary.mainThread.paint += entry.duration;
    }
    else if (entry.name === 'RunTask' && entry.duration >= 50)
    {
      summary.mainThread.longTaskCount += 1;
      summary.mainThread.longTaskTotal += entry.duration;
      summary.longTasks.push({
        durationMs: entry.duration,
        startMs: entry.ts,
        url: entry.url,
      });
    }
    else if (!entry.url)
    {
      summary.mainThread.other += entry.duration;
    }

    if (entry.name === 'LayoutShift' && typeof entry.layoutShiftValue === 'number')
    {
      summary.layoutShifts.push({
        value: entry.layoutShiftValue,
        startMs: entry.ts,
        sources: entry.layoutShiftSources,
      });
    }
  }

  return summary;
}

export function summarizeJsExecution(entries: RawTraceEntry[]): JsExecutionSummary
{
  const resources = new Map<string, {
    url: string;
    parseMs: number;
    evaluateMs: number;
    confidenceRank: number;
  }>();
  const unattributed = {
    parseMs: 0,
    evaluateMs: 0,
  };

  for (const entry of entries)
  {
    const isParse = isParseEntry(entry.name);
    const isEvaluate = isEvaluateEntry(entry.name);

    if (!isParse && !isEvaluate)
    {
      continue;
    }

    if (!entry.url)
    {
      if (isParse)
      {
        unattributed.parseMs += entry.duration;
      }
      else
      {
        unattributed.evaluateMs += entry.duration;
      }

      continue;
    }

    const current = resources.get(entry.url) ?? {
      url: entry.url,
      parseMs: 0,
      evaluateMs: 0,
      confidenceRank: 0,
    };

    if (isParse)
    {
      current.parseMs += entry.duration;
    }
    else
    {
      current.evaluateMs += entry.duration;
    }

    current.confidenceRank = Math.max(current.confidenceRank, toConfidenceRank(entry.attributionConfidence));
    resources.set(entry.url, current);
  }

  return {
    resources: [...resources.values()]
      .map((resource) => ({
        url: resource.url,
        parseMs: resource.parseMs,
        evaluateMs: resource.evaluateMs,
        totalMs: resource.parseMs + resource.evaluateMs,
        attributionConfidence: fromConfidenceRank(resource.confidenceRank || 1),
      }))
      .sort((left, right) => right.totalMs - left.totalMs || left.url.localeCompare(right.url)),
    unattributed: {
      parseMs: unattributed.parseMs,
      evaluateMs: unattributed.evaluateMs,
      totalMs: unattributed.parseMs + unattributed.evaluateMs,
    },
  };
}
