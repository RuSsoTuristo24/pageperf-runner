ALTER TABLE "profiles" ADD COLUMN "environment" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "transfer_size" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "encoded_body_size" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "decoded_body_size" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "content_encoding" text;