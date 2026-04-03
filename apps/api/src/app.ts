import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureAuthSession, createRunner, defaultExecuteLiveRun, validateAuthSession } from '@webperf/worker';
import Fastify, { type FastifyInstance } from 'fastify';

import { type Database } from './db/drizzle.js';
import { InMemoryAssetIssueRepository } from './modules/asset-issues/asset-issue.repository.js';
import { PgAssetIssueRepository } from './modules/asset-issues/pg-asset-issue.repository.js';
import { registerAssetIssueRoutes } from './modules/asset-issues/asset-issue.routes.js';
import { AssetIssueService } from './modules/asset-issues/asset-issue.service.js';
import { LlmReportService } from './modules/analysis/llm-report.service.js';
import { AuthSessionRepository } from './modules/auth/auth-session.repository.js';
import { registerAuthSessionRoutes } from './modules/auth/auth-session.routes.js';
import { AuthSessionService } from './modules/auth/auth-session.service.js';
import { ArtifactStore } from './modules/artifacts/artifact-store.js';
import { RunIngestService } from './modules/ingest/run-ingest.service.js';
import { ProfileService } from './modules/profiles/profile.service.js';
import { InMemoryProfileRepository } from './modules/profiles/profile.repository.js';
import { PgProfileRepository } from './modules/profiles/pg-profile.repository.js';
import { registerProfileRoutes } from './modules/profiles/profile.routes.js';
import { RunService } from './modules/runs/run.service.js';
import { registerRunDetailRoutes } from './modules/runs/run-details.routes.js';
import { registerRunLlmReportRoutes } from './modules/runs/run-llm-report.routes.js';
import { InMemoryRunRepository } from './modules/runs/run.repository.js';
import { PgRunRepository } from './modules/runs/pg-run.repository.js';
import { registerRunRoutes } from './modules/runs/run.routes.js';
import { ExtensionResolver } from './modules/extensions/extension-resolver.js';
import { registerExtensionRoutes } from './modules/extensions/extension.routes.js';
import { SettingsRepository } from './modules/settings/settings.repository.js';
import { registerSettingsRoutes } from './modules/settings/settings.routes.js';
import { registerHealthRoutes } from './routes/health.js';

type AppOptions = {
	runExecutor?: Parameters<typeof createRunner>[0]['executeLiveRun'];
	authCapture?: (input: { targetUrl: string; storageStatePath: string }) => Promise<void>;
	authValidate?: (input: { targetUrl: string; storageStatePath: string }) => Promise<boolean>;
	storageRoot?: string;
	modulesRoot?: string;
	db?: Database;
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
	const profileRepository = options.db
		? new PgProfileRepository(options.db)
		: new InMemoryProfileRepository(storageRoot);
	const runRepository = options.db
		? new PgRunRepository(options.db)
		: new InMemoryRunRepository(storageRoot);
	const assetIssueRepository = options.db
		? new PgAssetIssueRepository(options.db)
		: new InMemoryAssetIssueRepository(storageRoot);
	const authSessionRepository = new AuthSessionRepository(storageRoot);
	const artifactStore = new ArtifactStore(path.join(storageRoot, 'artifacts'));
	const runIngestService = new RunIngestService(runRepository);
	const profileService = new ProfileService(profileRepository);
	const assetIssueService = new AssetIssueService(assetIssueRepository, runRepository);
	const llmReportService = new LlmReportService(runRepository, profileRepository, assetIssueService);
	const authSessionService = new AuthSessionService(
		authSessionRepository,
		options.authCapture ?? captureAuthSession,
		options.authValidate ?? validateAuthSession,
	);
	const runner = createRunner({
		executeLiveRun: options.runExecutor ?? defaultExecuteLiveRun,
	});
	const runService = new RunService(
		runRepository,
		profileRepository,
		runIngestService,
		artifactStore,
		(job) => runner.start(job),
		authSessionService,
	);

	const settingsRepository = new SettingsRepository(storageRoot);
	const savedSettings = settingsRepository.get();
	const effectiveModulesRoot = savedSettings.modulesRoot || options.modulesRoot || '';

	// Mutable holder so the resolver can be swapped when settings change
	const resolverHolder = { current: effectiveModulesRoot ? new ExtensionResolver(effectiveModulesRoot) : null };

	registerHealthRoutes(app);
	registerSettingsRoutes(app, settingsRepository, (newRoot) =>
	{
		resolverHolder.current = new ExtensionResolver(newRoot);
	});
	registerExtensionRoutes(app, resolverHolder);
	registerAssetIssueRoutes(app, assetIssueService);
	registerAuthSessionRoutes(app, authSessionService);
	registerProfileRoutes(app, profileService);
	registerRunRoutes(app, runService);
	registerRunDetailRoutes(app, runRepository);
	registerRunLlmReportRoutes(app, llmReportService);

	return app;
}
