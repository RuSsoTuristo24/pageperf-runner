type RequestLike = {
  url: string;
  resourceType: string;
  decodedBodySize: number;
  encodedBodySize: number;
  transferSize: number;
  contentEncoding: string | null;
  renderBlocking: boolean;
};

type Issue = {
  code: string;
  severity: 'warning' | 'critical';
  evidence: string;
};

type DetectIssuesInput = {
  requests: RequestLike[];
  coldLoadMs: number;
  warmLoadMs: number;
};

export function detectIssues(input: DetectIssuesInput): Issue[]
{
  const issues: Issue[] = [];

  if (input.requests.some((request) => request.resourceType === 'script' && request.decodedBodySize > 500000))
  {
    issues.push({
      code: 'large-decoded-js',
      severity: 'critical',
      evidence: 'Script decoded size exceeds threshold',
    });
  }

  if (input.requests.some((request) => !request.contentEncoding))
  {
    issues.push({
      code: 'missing-compression',
      severity: 'warning',
      evidence: 'At least one request is missing content encoding',
    });
  }

  if (input.requests.some((request) => request.resourceType === 'stylesheet' && request.renderBlocking))
  {
    issues.push({
      code: 'render-blocking-css',
      severity: 'warning',
      evidence: 'Render-blocking stylesheet detected',
    });
  }

  if (input.coldLoadMs > 0 && (input.warmLoadMs / input.coldLoadMs) > 0.95)
  {
    issues.push({
      code: 'weak-warm-cache-improvement',
      severity: 'warning',
      evidence: 'Warm load is too close to cold load',
    });
  }

  return issues;
}
