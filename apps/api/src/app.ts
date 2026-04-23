import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunner } from '@pageperf-runner/worker';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerStatic } from './static.js';

import { AssetIssueRepository } from './modules/asset-issues/asset-issue.repository.js';
import { registerAssetIssueRoutes } from './modules/asset-issues/asset-issue.routes.js';
import { AssetIssueService } from './modules/asset-issues/asset-issue.service.js';
import { LlmReportService } from './modules/analysis/llm-report.service.js';
import { AuthSessionRepository } from './modules/auth/auth-session.repository.js';
import { registerAuthSessionRoutes } from './modules/auth/auth-session.routes.js';
import { AuthSessionScheduler } from './modules/auth/auth-session-scheduler.js';
import { AuthSessionService } from './modules/auth/auth-session.service.js';
import { registerConfigRoutes } from './modules/config/config.routes.js';
import { ArtifactCleanupService } from './modules/artifacts/artifact-cleanup.js';
import { ArtifactStore } from './modules/artifacts/artifact-store.js';
import { RunIngestService } from './modules/ingest/run-ingest.service.js';
import { ProfileService } from './modules/profiles/profile.service.js';
import { InMemoryProfileRepository } from './modules/profiles/profile.repository.js';
import { registerProfileRoutes } from './modules/profiles/profile.routes.js';
import { RunService } from './modules/runs/run.service.js';
import { registerRunDetailRoutes } from './modules/runs/run-details.routes.js';
import { registerRunLlmReportRoutes } from './modules/runs/run-llm-report.routes.js';
import { InMemoryRunRepository } from './modules/runs/run.repository.js';
import { registerRunRoutes } from './modules/runs/run.routes.js';
import { WorkerClient } from './modules/worker-client/worker-client.js';
import { registerHealthRoutes } from './routes/health.js';

type AppDb = {
	execute: (sql: string) => Promise<unknown>;
};

type AppOptions = {
	runExecutor?: Parameters<typeof createRunner>[0]['executeLiveRun'];
	authCapture?: (input: { targetUrl: string; storageStatePath: string }) => Promise<void>;
	authValidate?: (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>;
	authRefresh?: (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>;
	storageRoot?: string;
	db?: AppDb;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);

function resolveDefaultStorageRoot(): string
{
	return path.resolve(currentDirectoryPath, '../../..', 'storage');
}

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance>
{
	const app = Fastify();
	const storageRoot = options.storageRoot ?? resolveDefaultStorageRoot();
	const workerUrl = process.env.WORKER_URL ?? 'http://localhost:4311';
	const workerClient = new WorkerClient(workerUrl);
	const profileRepository = new InMemoryProfileRepository(storageRoot);
	const runRepository = new InMemoryRunRepository(storageRoot);
	const assetIssueRepository = new AssetIssueRepository(storageRoot);
	const authSessionRepository = new AuthSessionRepository(storageRoot);
	const artifactStore = new ArtifactStore(path.join(storageRoot, 'artifacts'));
	const retentionDays = Number(process.env.ARTIFACT_RETENTION_DAYS ?? 30);
	const artifactCleanup = new ArtifactCleanupService(artifactStore, retentionDays);
	artifactCleanup.schedule(process.env.ARTIFACT_CLEANUP_CRON ?? '0 3 1 * *');
	app.addHook('onClose', async () => {
		artifactCleanup.stop();
	});
	// Auth-session refresh scheduler: keep saved logins alive without manual
	// recapture. Default every 6 hours; override with AUTH_REFRESH_CRON.
	// Empty string disables the scheduler entirely.
	const runIngestService = new RunIngestService(runRepository);
	const profileService = new ProfileService(profileRepository);
	const assetIssueService = new AssetIssueService(assetIssueRepository, runRepository);
	const llmReportService = new LlmReportService(runRepository, profileRepository, assetIssueService);
	const authSessionService = new AuthSessionService(
		authSessionRepository,
		options.authCapture ?? ((input) => workerClient.captureAuthSession(input)),
		options.authValidate ?? ((input) => workerClient.validateAuthSession(input)),
		options.authRefresh ?? ((input) => workerClient.refreshAuthSession(input)),
	);
	const authRefreshCron = process.env.AUTH_REFRESH_CRON ?? '0 */6 * * *';
	const authRefreshScheduler = authRefreshCron.trim() === ''
		? null
		: new AuthSessionScheduler(authSessionService);
	if (authRefreshScheduler)
	{
		authRefreshScheduler.schedule(authRefreshCron);
		app.addHook('onClose', async () => {
			authRefreshScheduler.stop();
		});
	}
	const runner = createRunner({
		executeLiveRun: options.runExecutor ?? ((job) => workerClient.executeLiveRun(job)),
	});
	const runService = new RunService(
		runRepository,
		profileRepository,
		runIngestService,
		artifactStore,
		(job) => runner.start(job),
		authSessionService,
	);

	registerHealthRoutes(app, {
		checkDb: async () => {
			if (!options.db) return true;
			try
			{
				await options.db.execute('SELECT 1');
				return true;
			}
			catch
			{
				return false;
			}
		},
		checkWorker: async () => {
			try
			{
				const res = await fetch(`${workerUrl}/health`);
				return res.ok;
			}
			catch
			{
				return false;
			}
		},
	});
	registerAssetIssueRoutes(app, assetIssueService);
	registerAuthSessionRoutes(app, authSessionService);
	registerConfigRoutes(app, { vncUrl: process.env.VNC_URL?.trim() || null });
	registerProfileRoutes(app, profileService);
	registerRunRoutes(app, runService);
	registerRunDetailRoutes(app, runRepository);
	registerRunLlmReportRoutes(app, llmReportService);

	const distPath = process.env.WEB_DIST_PATH ?? '/app/apps/web/dist';
	if (existsSync(distPath))
	{
		await registerStatic(app, distPath);
		app.log.info({ distPath }, 'web UI static registered');
	}
	else
	{
		app.log.warn({ distPath }, 'web UI dist not found — UI disabled');
	}

	return app;
}
