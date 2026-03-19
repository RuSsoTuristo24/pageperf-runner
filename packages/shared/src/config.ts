import path from 'node:path';

import { parseEnv, type WebPerfEnv } from './env.js';

export type NetworkProfile = {
	downloadKbps: number;
	uploadKbps: number;
	latencyMs: number;
};

export const throttlingProfiles: Record<string, NetworkProfile> = {
	native: { downloadKbps: 0, uploadKbps: 0, latencyMs: 0 },
	'slow-4g': { downloadKbps: 1600, uploadKbps: 750, latencyMs: 150 },
	'fast-3g': { downloadKbps: 1600, uploadKbps: 750, latencyMs: 300 },
	'slow-3g': { downloadKbps: 500, uploadKbps: 500, latencyMs: 400 },
};

export function resolveArtifactRoot(root: string): string
{
	return path.resolve(root);
}

export type RuntimeConfig = {
	port: number;
	databaseUrl: string;
	artifactRoot: string;
	chromePath: string;
};

export function loadConfig(input: Record<string, string | undefined>): RuntimeConfig
{
	const env: WebPerfEnv = parseEnv(input);

	return {
		port: env.PORT,
		databaseUrl: env.DATABASE_URL,
		artifactRoot: resolveArtifactRoot(env.ARTIFACT_ROOT),
		chromePath: env.CHROME_PATH,
	};
}
