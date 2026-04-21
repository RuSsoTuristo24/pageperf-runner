import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunner } from '@webperf/worker';
import Fastify, { type FastifyInstance } from 'fastify';

import { AssetIssueRepository } from './modules/asset-issues/asset-issue.repository.js';
import { registerAssetIssueRoutes } from './modules/asset-issues/asset-issue.routes.js';
import { AssetIssueService } from './modules/asset-issues/asset-issue.service.js';
import { LlmReportService } from './modules/analysis/llm-report.service.js';
import { AuthSessionRepository } from './modules/auth/auth-session.repository.js';
import { registerAuthSessionRoutes } from './modules/auth/auth-session.routes.js';
import { AuthSessionService } from './modules/auth/auth-session.service.js';
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

type AppOptions = {
	runExecutor?: Parameters<typeof createRunner>[0]['executeLiveRun'];
	authCapture?: (input: { targetUrl: string; storageStatePath: string }) => Promise<void>;
	authValidate?: (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>;
	storageRoot?: string;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);

function resolveDefaultStorageRoot(): string
{
	return path.resolve(currentDirectoryPath, '../../..', 'storage');
}

export function createApp(options: AppOptions = {}): FastifyInstance
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
	const runIngestService = new RunIngestService(runRepository);
	const profileService = new ProfileService(profileRepository);
	const assetIssueService = new AssetIssueService(assetIssueRepository, runRepository);
	const llmReportService = new LlmReportService(runRepository, profileRepository, assetIssueService);
	const authSessionService = new AuthSessionService(
		authSessionRepository,
		options.authCapture ?? ((input) => workerClient.captureAuthSession(input)),
		options.authValidate ?? ((input) => workerClient.validateAuthSession(input)),
	);
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

	registerHealthRoutes(app);
	registerAssetIssueRoutes(app, assetIssueService);
	registerAuthSessionRoutes(app, authSessionService);
	registerProfileRoutes(app, profileService);
	registerRunRoutes(app, runService);
	registerRunDetailRoutes(app, runRepository);
	registerRunLlmReportRoutes(app, llmReportService);

	return app;
}
