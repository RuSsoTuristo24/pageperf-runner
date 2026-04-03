ALTER TABLE "profiles" ADD COLUMN "scheduled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "cron_expression" text;