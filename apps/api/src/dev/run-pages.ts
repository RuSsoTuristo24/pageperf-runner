import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';
import type { Profile } from '@pageperf-runner/shared';

import { createApp } from '../app.js';

type RunPagesOptions = {
	pages: string[];
	throttling: Profile['throttling'];
	cacheMode: Profile['cacheMode'];
};

type RunPageSummary = {
	url: string;
	profileId: string;
	runId: string;
	throttling: Profile['throttling'];
	cacheMode: Profile['cacheMode'];
	status: string;
	loadMs: number;
	requestCount: number;
	artifactCount: number;
};

function deriveProfileName(url: string, index: number): string
{
	const parsedUrl = new URL(url);
	const pathname = parsedUrl.pathname === '/' ? 'home' : parsedUrl.pathname;

	return `Page ${index + 1}: ${pathname}`;
}

async function expectJsonResponse<T>(
	app: FastifyInstance,
	request: { method: 'GET' | 'POST'; url: string; payload?: unknown },
): Promise<T>
{
	const response = await app.inject(request);

	if (response.statusCode < 200 || response.statusCode >= 300)
	{
		throw new Error(`Request ${request.method} ${request.url} failed: ${response.statusCode} ${response.body}`);
	}

	return response.json() as T;
}

export async function runPagesWithApp(
	app: FastifyInstance,
	options: RunPagesOptions,
): Promise<RunPageSummary[]>
{
	const results: RunPageSummary[] = [];

	for (let index = 0; index < options.pages.length; index += 1)
	{
		const url = options.pages[index];
		const profile = await expectJsonResponse<{ id: string } & Profile>(app, {
			method: 'POST',
			url: '/api/profiles',
			payload: {
				name: deriveProfileName(url, index),
				url,
				throttling: options.throttling,
				cacheMode: options.cacheMode,
			},
		});
		const run = await expectJsonResponse<{ id: string; profileId: string; status: string }>(app, {
			method: 'POST',
			url: '/api/runs',
			payload: {
				profileId: profile.id,
			},
		});
		const startedRun = await expectJsonResponse<{
			run: { id: string; status: string };
			pageMetrics: Array<{ name: string; value: number }>;
			requests: Array<unknown>;
			artifacts: Array<unknown>;
		}>(app, {
			method: 'POST',
			url: `/api/runs/${run.id}/start`,
		});

		results.push({
			url,
			profileId: profile.id,
			runId: startedRun.run.id,
			throttling: options.throttling,
			cacheMode: options.cacheMode,
			status: startedRun.run.status,
			loadMs: startedRun.pageMetrics.find((metric) => metric.name === 'load')?.value ?? 0,
			requestCount: startedRun.requests.length,
			artifactCount: startedRun.artifacts.length,
		});
	}

	return results;
}

export function parseRunPagesArgs(argv: string[]): RunPagesOptions
{
	const pages: string[] = [];
	let throttling: Profile['throttling'] = 'native';
	let cacheMode: Profile['cacheMode'] = 'cold';

	for (let index = 0; index < argv.length; index += 1)
	{
		const argument = argv[index];
		const nextArgument = argv[index + 1];

		if (argument === '--url' && nextArgument)
		{
			pages.push(nextArgument);
			index += 1;
			continue;
		}

		if (argument === '--throttling' && nextArgument)
		{
			if (nextArgument === 'native' || nextArgument === 'slow-4g' || nextArgument === 'fast-3g' || nextArgument === 'slow-3g')
			{
				throttling = nextArgument;
				index += 1;
				continue;
			}

			throw new Error(`Unsupported throttling preset: ${nextArgument}`);
		}

		if (argument === '--cache-mode' && nextArgument)
		{
			if (nextArgument === 'cold' || nextArgument === 'warm' || nextArgument === 'both')
			{
				cacheMode = nextArgument;
				index += 1;
				continue;
			}

			throw new Error(`Unsupported cache mode: ${nextArgument}`);
		}
	}

	if (pages.length === 0)
	{
		throw new Error('Provide at least one --url value');
	}

	return { pages, throttling, cacheMode };
}

function resolveWorkspaceStorageRoot(): string
{
	const currentFile = fileURLToPath(import.meta.url);
	const currentDirectory = path.dirname(currentFile);

	return path.resolve(currentDirectory, '../../../..', 'storage');
}

async function main(): Promise<void>
{
	const options = parseRunPagesArgs(process.argv.slice(2));
	const app = await createApp({ storageRoot: resolveWorkspaceStorageRoot() });

	try
	{
		const results = await runPagesWithApp(app, options);
		console.table(results);
	}
	finally
	{
		await app.close();
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
{
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
