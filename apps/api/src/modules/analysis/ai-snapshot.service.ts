type RunLike = {
  id: string;
  profileId: string;
  status: string;
};

type PageMetricLike = {
  name: string;
  value: number;
};

type RequestLike = {
  url: string;
  method: string;
  resourceType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
};

type IssueLike = {
  code: string;
  severity: string;
  evidence: string;
};

type CompareToBaseline = {
  loadDeltaMs: number;
  encodedBytesDelta: number;
};

type BuildAiSnapshotInput = {
  run: RunLike;
  pageMetrics: PageMetricLike[];
  requests: RequestLike[];
  issues: IssueLike[];
  compareToBaseline?: CompareToBaseline;
};

export function buildAiSnapshot(input: BuildAiSnapshotInput): {
  runId: string;
  status: string;
  summary: {
    metrics: Record<string, number>;
    requestCount: number;
    encodedBytes: number;
    decodedBytes: number;
  };
  heavyAssets: RequestLike[];
  slowRequests: RequestLike[];
  issues: IssueLike[];
  compareToBaseline?: CompareToBaseline;
}
{
  const metrics = Object.fromEntries(
    input.pageMetrics.map((metric) => [metric.name, metric.value]),
  );

  const sortedByDecoded = [...input.requests].sort(
    (left, right) => right.decodedBodySize - left.decodedBodySize,
  );

  const sortedByTransfer = [...input.requests].sort(
    (left, right) => right.transferSize - left.transferSize,
  );

  return {
    runId: input.run.id,
    status: input.run.status,
    summary: {
      metrics,
      requestCount: input.requests.length,
      encodedBytes: input.requests.reduce((sum, request) => sum + request.encodedBodySize, 0),
      decodedBytes: input.requests.reduce((sum, request) => sum + request.decodedBodySize, 0),
    },
    heavyAssets: sortedByDecoded.slice(0, 5),
    slowRequests: sortedByTransfer.slice(0, 5),
    issues: input.issues,
    compareToBaseline: input.compareToBaseline,
  };
}
