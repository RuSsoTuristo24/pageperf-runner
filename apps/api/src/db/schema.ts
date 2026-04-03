import { boolean, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// ── Profiles ─────────────────────────────────────────────
export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  throttling: text('throttling').notNull().default('native'),
  authMode: text('auth_mode').notNull().default('none'),
  cacheMode: text('cache_mode').notNull().default('cold'),
  pages: jsonb('pages').$type<string[]>().notNull().default([]),
  repeatCount: integer('repeat_count').notNull().default(1),
  scheduled: boolean('scheduled').notNull().default(false),
  cronExpression: text('cron_expression'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Runs ─────────────────────────────────────────────────
export const runs = pgTable('runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull(),
  status: text('status').notNull().default('queued'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ── Page Metrics (flat rows for Grafana) ─────────────────
export const pageMetrics = pgTable('page_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull(),
  passLabel: text('pass_label'),
  pageKey: text('page_key'),
  name: text('name').notNull(),
  value: real('value').notNull(),
});

// ── Run Details (JSONB for heavy nested data) ────────────
export const runDetails = pgTable('run_details', {
  runId: uuid('run_id').primaryKey(),
  requests: jsonb('requests').notNull().default([]),
  artifacts: jsonb('artifacts').notNull().default([]),
  passes: jsonb('passes').notNull().default([]),
  pages: jsonb('pages').notNull().default([]),
  traceSummary: jsonb('trace_summary'),
  jsExecutionSummary: jsonb('js_execution_summary'),
  coverageSummary: jsonb('coverage_summary'),
  pageDiagnostics: jsonb('page_diagnostics'),
});

// ── Asset Issues ─────────────────────────────────────────
export const assetIssues = pgTable('asset_issues', {
  assetKey: text('asset_key').primaryKey(),
  assetUrl: text('asset_url').notNull(),
  resourceType: text('resource_type').notNull(),
  mantisUrl: text('mantis_url').notNull(),
  status: text('status').notNull().default('open'),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

// ── Artifacts (metadata only, files on disk) ─────────────
export const artifacts = pgTable('artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull(),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
});
