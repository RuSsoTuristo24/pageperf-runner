export type NavigationEntryLike = {
  responseStart?: number;
  domContentLoadedEventEnd?: number;
  loadEventEnd?: number;
};

export type PaintEntryLike = {
  name: string;
  startTime: number;
};

export type PageMetricRecord = {
  name: 'ttfb' | 'fp' | 'fcp' | 'lcp' | 'cls' | 'dcl' | 'load';
  value: number;
};

type NormalizePageMetricsInput = {
  navigationEntry?: NavigationEntryLike;
  paintEntries?: PaintEntryLike[];
  largestContentfulPaint?: number;
  cumulativeLayoutShift?: number;
};

export function normalizePageMetrics(input: NormalizePageMetricsInput): PageMetricRecord[]
{
  const metrics: PageMetricRecord[] = [];
  const navigation = input.navigationEntry ?? {};
  const paintMap = new Map((input.paintEntries ?? []).map((entry) => [entry.name, entry.startTime]));

  if (Number.isFinite(navigation.responseStart))
  {
    metrics.push({ name: 'ttfb', value: Number(navigation.responseStart) });
  }

  if (Number.isFinite(paintMap.get('first-paint')))
  {
    metrics.push({ name: 'fp', value: Number(paintMap.get('first-paint')) });
  }

  if (Number.isFinite(paintMap.get('first-contentful-paint')))
  {
    metrics.push({ name: 'fcp', value: Number(paintMap.get('first-contentful-paint')) });
  }

  if (Number.isFinite(input.largestContentfulPaint))
  {
    metrics.push({ name: 'lcp', value: Number(input.largestContentfulPaint) });
  }

  if (Number.isFinite(input.cumulativeLayoutShift))
  {
    metrics.push({ name: 'cls', value: Number(input.cumulativeLayoutShift) });
  }

  if (Number.isFinite(navigation.domContentLoadedEventEnd))
  {
    metrics.push({ name: 'dcl', value: Number(navigation.domContentLoadedEventEnd) });
  }

  if (Number.isFinite(navigation.loadEventEnd))
  {
    metrics.push({ name: 'load', value: Number(navigation.loadEventEnd) });
  }

  return metrics;
}
