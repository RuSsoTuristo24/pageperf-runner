CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_issues" (
	"asset_key" text PRIMARY KEY NOT NULL,
	"asset_url" text NOT NULL,
	"resource_type" text NOT NULL,
	"mantis_url" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "page_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"pass_label" text,
	"page_key" text,
	"name" text NOT NULL,
	"value" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"throttling" text DEFAULT 'native' NOT NULL,
	"auth_mode" text DEFAULT 'none' NOT NULL,
	"cache_mode" text DEFAULT 'cold' NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repeat_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_details" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"passes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trace_summary" jsonb,
	"js_execution_summary" jsonb,
	"coverage_summary" jsonb,
	"page_diagnostics" jsonb
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
