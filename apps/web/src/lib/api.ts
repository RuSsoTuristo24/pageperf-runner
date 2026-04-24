export type ApiProfile = {
	id: string;
	name: string;
	url: string;
	pages?: string[];
	throttling: string;
	authMode: 'none' | 'session';
	cacheMode: 'cold' | 'warm' | 'both';
	isTemplate: boolean;
};

export type ApiRun = {
	id: string;
	profileId: string;
	status: string;
	createdAt?: string;
	completedAt?: string;
};

export type ApiAssetIssue = {
	assetKey: string;
	assetUrl: string;
	resourceType: string;
	mantisUrl: string;
	status: 'open' | 'review' | 'closed';
	note: string;
	createdAt: string;
	updatedAt: string;
	closedAt?: string;
	returnedAfterClose: boolean;
	lastSeenAt?: string;
	lastSeenRunId?: string;
};

export type ApiRunDetails = {
	run: ApiRun;
	pageMetrics: Array<{ name: string; value: number }>;
	requests: Array<{
		url: string;
		method: string;
		resourceType: string;
		contentEncoding?: string | null;
		transferSize: number;
		encodedBodySize: number;
		decodedBodySize: number;
		durationMs?: number;
		startTimeMs?: number;
		endTimeMs?: number;
		queueingMs?: number;
		dnsMs?: number;
		connectMs?: number;
		sslMs?: number;
		requestSentMs?: number;
		waitingMs?: number;
		downloadMs?: number;
		initiatorType?: 'parser' | 'script' | 'preload' | 'fetch' | 'xmlhttprequest' | 'other';
		initiatorUrl?: string;
		redirectParentUrl?: string;
		protocol?: string;
		priority?: string;
	}>;
	artifacts: Array<{ kind: string; path: string }>;
	traceSummary?: {
		criticalChain: Array<{ url: string; duration: number }>;
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
	jsExecutionSummary?: {
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
	coverageSummary?: {
		totals: {
			js: { usedBytes: number; unusedBytes: number };
			css: { usedBytes: number; unusedBytes: number };
		};
	};
	pageDiagnostics?: {
		dom: { nodeCount: number; treeDepth: number; eventListenerCount: number };
		heap: { usedBytes: number; totalBytes: number };
		oversizedImages: Array<{
			url: string;
			naturalWidth: number;
			naturalHeight: number;
			displayWidth: number;
			displayHeight: number;
			wastedPixels: number;
			estimatedWastedBytes: number;
		}>;
		thirdParty: {
			origins: Array<{
				origin: string;
				transferBytes: number;
				requestCount: number;
				blockingTimeMs: number;
			}>;
			totalTransferBytes: number;
			totalRequests: number;
		};
		renderBlocking: Array<{
			url: string;
			resourceType: string;
			durationMs: number;
			transferBytes: number;
		}>;
		unusedPreloads: string[];
		protocolDistribution: Array<{
			protocol: string;
			requestCount: number;
			transferBytes: number;
		}>;
	};
	passes?: Array<{
		label: 'cold' | 'warm';
		pageMetrics: Array<{ name: string; value: number }>;
		requests: Array<{
			url: string;
			method: string;
			resourceType: string;
			contentEncoding?: string | null;
			transferSize: number;
			encodedBodySize: number;
			decodedBodySize: number;
			durationMs?: number;
			startTimeMs?: number;
			endTimeMs?: number;
			queueingMs?: number;
			dnsMs?: number;
			connectMs?: number;
			sslMs?: number;
			requestSentMs?: number;
			waitingMs?: number;
			downloadMs?: number;
			initiatorType?: 'parser' | 'script' | 'preload' | 'fetch' | 'xmlhttprequest' | 'other';
			initiatorUrl?: string;
			redirectParentUrl?: string;
			protocol?: string;
			priority?: string;
		}>;
		traceSummary?: {
			criticalChain: Array<{ url: string; duration: number }>;
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
		jsExecutionSummary?: {
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
		coverageSummary?: {
			totals: {
				js: { usedBytes: number; unusedBytes: number };
				css: { usedBytes: number; unusedBytes: number };
			};
		};
		pageDiagnostics?: {
			dom: { nodeCount: number; treeDepth: number; eventListenerCount: number };
			heap: { usedBytes: number; totalBytes: number };
			oversizedImages: Array<{
				url: string;
				naturalWidth: number;
				naturalHeight: number;
				displayWidth: number;
				displayHeight: number;
				wastedPixels: number;
				estimatedWastedBytes: number;
			}>;
			thirdParty: {
				origins: Array<{
					origin: string;
					transferBytes: number;
					requestCount: number;
					blockingTimeMs: number;
				}>;
				totalTransferBytes: number;
				totalRequests: number;
			};
			renderBlocking: Array<{
				url: string;
				resourceType: string;
				durationMs: number;
				transferBytes: number;
			}>;
			unusedPreloads: string[];
			protocolDistribution: Array<{
				protocol: string;
				requestCount: number;
				transferBytes: number;
			}>;
		};
	}>;
	pages?: Array<{
		pageKey: string;
		url: string;
		pageMetrics: Array<{ name: string; value: number }>;
		requests: Array<{
			url: string;
			method: string;
			resourceType: string;
			contentEncoding?: string | null;
			transferSize: number;
			encodedBodySize: number;
			decodedBodySize: number;
			durationMs?: number;
			startTimeMs?: number;
			endTimeMs?: number;
			queueingMs?: number;
			dnsMs?: number;
			connectMs?: number;
			sslMs?: number;
			requestSentMs?: number;
			waitingMs?: number;
			downloadMs?: number;
			initiatorType?: 'parser' | 'script' | 'preload' | 'fetch' | 'xmlhttprequest' | 'other';
			initiatorUrl?: string;
			redirectParentUrl?: string;
			protocol?: string;
			priority?: string;
		}>;
		traceSummary?: {
			criticalChain: Array<{ url: string; duration: number }>;
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
		jsExecutionSummary?: {
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
		coverageSummary?: {
			totals: {
				js: { usedBytes: number; unusedBytes: number };
				css: { usedBytes: number; unusedBytes: number };
			};
		};
		pageDiagnostics?: {
			dom: { nodeCount: number; treeDepth: number; eventListenerCount: number };
			heap: { usedBytes: number; totalBytes: number };
			oversizedImages: Array<{
				url: string;
				naturalWidth: number;
				naturalHeight: number;
				displayWidth: number;
				displayHeight: number;
				wastedPixels: number;
				estimatedWastedBytes: number;
			}>;
			thirdParty: {
				origins: Array<{
					origin: string;
					transferBytes: number;
					requestCount: number;
					blockingTimeMs: number;
				}>;
				totalTransferBytes: number;
				totalRequests: number;
			};
			renderBlocking: Array<{
				url: string;
				resourceType: string;
				durationMs: number;
				transferBytes: number;
			}>;
			unusedPreloads: string[];
			protocolDistribution: Array<{
				protocol: string;
				requestCount: number;
				transferBytes: number;
			}>;
		};
		passes?: Array<{
			label: 'cold' | 'warm';
			pageMetrics: Array<{ name: string; value: number }>;
			requests: Array<{
				url: string;
				method: string;
				resourceType: string;
				contentEncoding?: string | null;
				transferSize: number;
				encodedBodySize: number;
				decodedBodySize: number;
				durationMs?: number;
				startTimeMs?: number;
				endTimeMs?: number;
				queueingMs?: number;
				dnsMs?: number;
				connectMs?: number;
				sslMs?: number;
				requestSentMs?: number;
				waitingMs?: number;
				downloadMs?: number;
				initiatorType?: 'parser' | 'script' | 'preload' | 'fetch' | 'xmlhttprequest' | 'other';
				initiatorUrl?: string;
					redirectParentUrl?: string;
					protocol?: string;
					priority?: string;
				}>;
				traceSummary?: {
					criticalChain: Array<{ url: string; duration: number }>;
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
				jsExecutionSummary?: {
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
				coverageSummary?: {
					totals: {
						js: { usedBytes: number; unusedBytes: number };
						css: { usedBytes: number; unusedBytes: number };
					};
				};
				pageDiagnostics?: {
					dom: { nodeCount: number; treeDepth: number; eventListenerCount: number };
					heap: { usedBytes: number; totalBytes: number };
					oversizedImages: Array<{
						url: string;
						naturalWidth: number;
						naturalHeight: number;
						displayWidth: number;
						displayHeight: number;
						wastedPixels: number;
						estimatedWastedBytes: number;
					}>;
					thirdParty: {
						origins: Array<{
							origin: string;
							transferBytes: number;
							requestCount: number;
							blockingTimeMs: number;
						}>;
						totalTransferBytes: number;
						totalRequests: number;
					};
					renderBlocking: Array<{
						url: string;
						resourceType: string;
						durationMs: number;
						transferBytes: number;
					}>;
					unusedPreloads: string[];
					protocolDistribution: Array<{
						protocol: string;
						requestCount: number;
						transferBytes: number;
					}>;
				};
			}>;
	}>;
};

export type ApiLlmReport = {
	runId: string;
	passLabel: 'cold' | 'warm';
	format: 'markdown';
	generatedAt: string;
	content: string;
};

export type CreateProfilePayload = {
	name: string;
	url: string;
	pages?: string[];
	throttling: string;
	authMode: 'none' | 'session';
	cacheMode: 'cold' | 'warm' | 'both';
	isTemplate?: boolean;
};

export type ApiAuthSession = {
	host: string;
	status: 'missing' | 'capturing' | 'ready' | 'failed';
	targetUrl?: string;
	updatedAt?: string;
	error?: string;
};

export function hostFromUrl(url: string): string | null
{
	try
	{
		return new URL(url).host;
	}
	catch
	{
		return null;
	}
}

type ApiTraceSummary = NonNullable<ApiRunDetails['traceSummary']>;
type ApiJsExecutionSummary = NonNullable<ApiRunDetails['jsExecutionSummary']>;

function toFiniteNumber(value: unknown, fallback = 0): number
{
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}

function normalizeTraceSummary(traceSummary: unknown): ApiTraceSummary | undefined
{
	if (!traceSummary || typeof traceSummary !== 'object')
	{
		return undefined;
	}

	const candidate = traceSummary as {
		criticalChain?: unknown;
		mainThread?: Record<string, unknown>;
		longTasks?: unknown;
		layoutShifts?: unknown;
		forcedReflows?: unknown;
	};
	const mainThread = candidate.mainThread;

	if (!mainThread || typeof mainThread !== 'object')
	{
		return undefined;
	}

	return {
		criticalChain: Array.isArray(candidate.criticalChain)
			? candidate.criticalChain.flatMap((entry) => {
				if (!entry || typeof entry !== 'object')
				{
					return [];
				}

				const nextEntry = entry as { url?: unknown; duration?: unknown };

				return typeof nextEntry.url === 'string'
					? [{
						url: nextEntry.url,
						duration: toFiniteNumber(nextEntry.duration),
					}]
					: [];
			})
			: [],
		mainThread: {
			parse: toFiniteNumber(mainThread.parse),
			evaluate: toFiniteNumber(mainThread.evaluate, toFiniteNumber(mainThread.script)),
			layout: toFiniteNumber(mainThread.layout),
			paint: toFiniteNumber(mainThread.paint),
			other: toFiniteNumber(mainThread.other),
			longTaskCount: toFiniteNumber(mainThread.longTaskCount),
			longTaskTotal: toFiniteNumber(mainThread.longTaskTotal),
		},
		longTasks: Array.isArray(candidate.longTasks)
			? candidate.longTasks.flatMap((entry) => {
				if (!entry || typeof entry !== 'object')
				{
					return [];
				}

				const nextEntry = entry as { durationMs?: unknown; startMs?: unknown; url?: unknown };

				return [{
					durationMs: toFiniteNumber(nextEntry.durationMs),
					...(typeof nextEntry.startMs === 'number' ? { startMs: nextEntry.startMs } : {}),
					...(typeof nextEntry.url === 'string' ? { url: nextEntry.url } : {}),
				}];
			})
			: [],
		layoutShifts: Array.isArray(candidate.layoutShifts)
			? candidate.layoutShifts.flatMap((entry) => {
				if (!entry || typeof entry !== 'object')
				{
					return [];
				}

				const nextEntry = entry as { value?: unknown; startMs?: unknown; sources?: unknown };

				return [{
					value: toFiniteNumber(nextEntry.value),
					...(typeof nextEntry.startMs === 'number' ? { startMs: nextEntry.startMs } : {}),
					...(Array.isArray(nextEntry.sources) ? { sources: nextEntry.sources.filter((s): s is string => typeof s === 'string') } : {}),
				}];
			})
			: [],
		forcedReflows: Array.isArray(candidate.forcedReflows)
			? candidate.forcedReflows.flatMap((entry) => {
				if (!entry || typeof entry !== 'object')
				{
					return [];
				}

				const nextEntry = entry as { durationMs?: unknown; startMs?: unknown; url?: unknown };

				return [{
					durationMs: toFiniteNumber(nextEntry.durationMs),
					...(typeof nextEntry.startMs === 'number' ? { startMs: nextEntry.startMs } : {}),
					...(typeof nextEntry.url === 'string' ? { url: nextEntry.url } : {}),
				}];
			})
			: [],
	};
}

function normalizeJsExecutionSummary(jsExecutionSummary: unknown): ApiJsExecutionSummary | undefined
{
	if (!jsExecutionSummary || typeof jsExecutionSummary !== 'object')
	{
		return undefined;
	}

	const candidate = jsExecutionSummary as {
		resources?: unknown;
		unattributed?: Record<string, unknown>;
	};

	return {
		resources: Array.isArray(candidate.resources)
			? candidate.resources.flatMap((entry) => {
				if (!entry || typeof entry !== 'object')
				{
					return [];
				}

				const nextEntry = entry as {
					url?: unknown;
					parseMs?: unknown;
					evaluateMs?: unknown;
					totalMs?: unknown;
					attributionConfidence?: unknown;
				};

				return typeof nextEntry.url === 'string'
					? [{
						url: nextEntry.url,
						parseMs: toFiniteNumber(nextEntry.parseMs),
						evaluateMs: toFiniteNumber(nextEntry.evaluateMs),
						totalMs: toFiniteNumber(nextEntry.totalMs, toFiniteNumber(nextEntry.parseMs) + toFiniteNumber(nextEntry.evaluateMs)),
						attributionConfidence: nextEntry.attributionConfidence === 'high'
							|| nextEntry.attributionConfidence === 'medium'
							|| nextEntry.attributionConfidence === 'low'
							? nextEntry.attributionConfidence
							: 'low',
					}]
					: [];
			})
			: [],
		unattributed: {
			parseMs: toFiniteNumber(candidate.unattributed?.parseMs),
			evaluateMs: toFiniteNumber(candidate.unattributed?.evaluateMs),
			totalMs: toFiniteNumber(candidate.unattributed?.totalMs),
		},
	};
}

function normalizeRunDetails(details: ApiRunDetails): ApiRunDetails
{
	return {
		...details,
		passes: details.passes?.map((pass) => ({
			...pass,
			traceSummary: normalizeTraceSummary(pass.traceSummary),
			jsExecutionSummary: normalizeJsExecutionSummary(pass.jsExecutionSummary),
		})),
		traceSummary: normalizeTraceSummary(details.traceSummary),
		jsExecutionSummary: normalizeJsExecutionSummary(details.jsExecutionSummary),
		pages: details.pages?.map((page) => ({
			...page,
			passes: page.passes?.map((pass) => ({
				...pass,
				traceSummary: normalizeTraceSummary(pass.traceSummary),
				jsExecutionSummary: normalizeJsExecutionSummary(pass.jsExecutionSummary),
			})),
			traceSummary: normalizeTraceSummary(page.traceSummary),
			jsExecutionSummary: normalizeJsExecutionSummary(page.jsExecutionSummary),
		})),
	};
}

async function toApiError(response: Response, fallbackUrl: string): Promise<Error>
{
  try
  {
    const payload = await response.json() as { error?: unknown };

    if (typeof payload.error === 'string' && payload.error.trim() !== '')
    {
      return new Error(payload.error);
    }
  }
  catch
  {
    // Ignore non-JSON errors and fall back to the generic message.
  }

  return new Error(`Request failed for ${fallbackUrl} with status ${response.status}`);
}

async function fetchJson<T>(url: string): Promise<T>
{
	const response = await fetch(url);

	if (!response.ok)
	{
		throw await toApiError(response, url);
	}

	return response.json() as Promise<T>;
}

type AssetIssuePayload = {
	assetKey?: string;
	assetUrl?: string;
	resourceType?: string;
	mantisUrl: string;
	status: 'open' | 'review' | 'closed';
	note: string;
	closedAt?: string;
};

async function sendJson<T>(url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<T>
{
	const init: RequestInit = { method };
	if (body !== undefined)
	{
		init.headers = { 'Content-Type': 'application/json' };
		init.body = JSON.stringify(body);
	}
	const response = await fetch(url, init);

	if (!response.ok)
	{
		throw await toApiError(response, url);
	}

	if (response.status === 204)
	{
		return undefined as T;
	}

	return response.json() as Promise<T>;
}

export function fetchProfiles(): Promise<ApiProfile[]>
{
	return fetchJson<ApiProfile[]>('/api/profiles');
}

export function fetchRuns(): Promise<ApiRun[]>
{
	return fetchJson<ApiRun[]>('/api/runs');
}

export function fetchRunDetails(runId: string): Promise<ApiRunDetails>
{
	return fetchJson<ApiRunDetails>(`/api/runs/${runId}`).then(normalizeRunDetails);
}

export function createProfile(payload: CreateProfilePayload): Promise<ApiProfile>
{
	return sendJson<ApiProfile>('/api/profiles', 'POST', payload);
}

export function setProfileTemplate(profileId: string, isTemplate: boolean): Promise<ApiProfile>
{
	return sendJson<ApiProfile>(`/api/profiles/${profileId}/template`, 'PATCH', { isTemplate });
}

export function fetchAuthSessions(): Promise<ApiAuthSession[]>
{
	return fetchJson<ApiAuthSession[]>('/api/auth/sessions');
}

export type ApiAppConfig = {
	vncUrl: string | null;
};

export function fetchAppConfig(): Promise<ApiAppConfig>
{
	return fetchJson<ApiAppConfig>('/api/config');
}

export function fetchAuthSessionForHost(host: string): Promise<ApiAuthSession>
{
	return fetchJson<ApiAuthSession>(`/api/auth/sessions/${encodeURIComponent(host)}`);
}

export function fetchAssetIssues(): Promise<ApiAssetIssue[]>
{
	return fetchJson<ApiAssetIssue[]>('/api/asset-issues');
}

export function captureAuthSession(targetUrl: string): Promise<ApiAuthSession>
{
	return sendJson<ApiAuthSession>('/api/auth/sessions/capture', 'POST', { targetUrl });
}

export function deleteAuthSession(host: string): Promise<void>
{
	return sendJson<void>(`/api/auth/sessions/${encodeURIComponent(host)}`, 'DELETE');
}

export function createRun(profileId: string): Promise<ApiRun>
{
	return sendJson<ApiRun>('/api/runs', 'POST', { profileId });
}

export function startRun(runId: string): Promise<ApiRunDetails>
{
	return sendJson<ApiRunDetails>(`/api/runs/${runId}/start`, 'POST', {}).then(normalizeRunDetails);
}

export function deleteRun(runId: string): Promise<{ deleted: true; runId: string }>
{
	return sendJson<{ deleted: true; runId: string }>(`/api/runs/${runId}`, 'DELETE', {});
}

export function createAssetIssue(payload: AssetIssuePayload): Promise<ApiAssetIssue>
{
	return sendJson<ApiAssetIssue>('/api/asset-issues', 'POST', payload);
}

export function updateAssetIssue(payload: AssetIssuePayload & { assetKey: string }): Promise<ApiAssetIssue>
{
	return sendJson<ApiAssetIssue>('/api/asset-issues', 'PATCH', payload);
}

export function deleteAssetIssue(assetKey: string): Promise<{ deleted: true; assetKey: string }>
{
	return sendJson<{ deleted: true; assetKey: string }>('/api/asset-issues', 'DELETE', { assetKey });
}

export function fetchLlmReport(
	runId: string,
	passLabel?: 'cold' | 'warm' | null,
	pageKey?: string | null,
): Promise<ApiLlmReport>
{
	const params = new URLSearchParams();

	if (passLabel)
	{
		params.set('pass', passLabel);
	}

	if (pageKey)
	{
		params.set('page', pageKey);
	}

	const suffix = params.size > 0 ? `?${params.toString()}` : '';

	return fetchJson<ApiLlmReport>(`/api/runs/${runId}/llm-report${suffix}`);
}

export type ApiRunSchedule = {
	id: string;
	profileId: string;
	cronExpression: string;
	enabled: boolean;
	lastTriggeredAt: string | null;
	lastRunId: string | null;
	createdAt: string;
	updatedAt: string;
};

export async function fetchProfileSchedule(profileId: string): Promise<ApiRunSchedule | null>
{
	const response = await fetch(`/api/profiles/${profileId}/schedule`);
	if (response.status === 404) return null;
	if (!response.ok) throw await toApiError(response, `/api/profiles/${profileId}/schedule`);
	return response.json() as Promise<ApiRunSchedule>;
}

export function putProfileSchedule(profileId: string, payload: { cronExpression: string; enabled: boolean }): Promise<ApiRunSchedule>
{
	return sendJson<ApiRunSchedule>(`/api/profiles/${profileId}/schedule`, 'PUT', payload);
}

export function deleteProfileSchedule(profileId: string): Promise<void>
{
	return sendJson<void>(`/api/profiles/${profileId}/schedule`, 'DELETE');
}

export type ProfilePatch = {
	name?: string;
	url?: string;
	pages?: string[];
	throttling?: string;
	authMode?: 'none' | 'session';
	cacheMode?: 'cold' | 'warm' | 'both';
};

export function updateProfile(profileId: string, patch: ProfilePatch): Promise<ApiProfile>
{
	return sendJson<ApiProfile>(`/api/profiles/${profileId}`, 'PATCH', patch);
}
