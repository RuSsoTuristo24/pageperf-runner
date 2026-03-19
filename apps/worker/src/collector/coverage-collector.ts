export type RawCoverageEntry = {
  url: string;
  type: 'js' | 'css';
  totalBytes: number;
  usedBytes: number;
};

export type CoverageSummary = {
  totals: {
    js: { usedBytes: number; unusedBytes: number };
    css: { usedBytes: number; unusedBytes: number };
  };
  resources: Array<{
    url: string;
    type: 'js' | 'css';
    usedBytes: number;
    unusedBytes: number;
  }>;
};

export function summarizeCoverage(entries: RawCoverageEntry[]): CoverageSummary
{
  const summary: CoverageSummary = {
    totals: {
      js: { usedBytes: 0, unusedBytes: 0 },
      css: { usedBytes: 0, unusedBytes: 0 },
    },
    resources: [],
  };

  for (const entry of entries)
  {
    const unusedBytes = Math.max(0, entry.totalBytes - entry.usedBytes);

    summary.resources.push({
      url: entry.url,
      type: entry.type,
      usedBytes: entry.usedBytes,
      unusedBytes,
    });

    summary.totals[entry.type].usedBytes += entry.usedBytes;
    summary.totals[entry.type].unusedBytes += unusedBytes;
  }

  return summary;
}
