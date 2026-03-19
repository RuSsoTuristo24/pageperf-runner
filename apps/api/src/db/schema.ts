import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	url: text('url').notNull(),
	throttling: text('throttling').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const runs = pgTable('runs', {
	id: uuid('id').defaultRandom().primaryKey(),
	profileId: uuid('profile_id').notNull(),
	status: text('status').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pageMetrics = pgTable('page_metrics', {
	id: uuid('id').defaultRandom().primaryKey(),
	runId: uuid('run_id').notNull(),
	name: text('name').notNull(),
	value: integer('value').notNull(),
});

export const requests = pgTable('requests', {
	id: uuid('id').defaultRandom().primaryKey(),
	runId: uuid('run_id').notNull(),
	url: text('url').notNull(),
	resourceType: text('resource_type').notNull(),
	status: integer('status').notNull(),
});

export const assets = pgTable('assets', {
	id: uuid('id').defaultRandom().primaryKey(),
	url: text('url').notNull(),
	type: text('type').notNull(),
});

export const issues = pgTable('issues', {
	id: uuid('id').defaultRandom().primaryKey(),
	runId: uuid('run_id').notNull(),
	code: text('code').notNull(),
	severity: text('severity').notNull(),
});

export const artifacts = pgTable('artifacts', {
	id: uuid('id').defaultRandom().primaryKey(),
	runId: uuid('run_id').notNull(),
	kind: text('kind').notNull(),
	path: text('path').notNull(),
});

export const schemaTables = {
	profiles,
	runs,
	pageMetrics,
	requests,
	assets,
	issues,
	artifacts,
};
