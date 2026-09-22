ALTER TABLE "scrape_target" ADD COLUMN "next_poll_at" timestamp;--> statement-breakpoint
ALTER TABLE "scrape_target" ADD COLUMN "last_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "scrape_target" ADD COLUMN "last_success_at" timestamp;--> statement-breakpoint
ALTER TABLE "scrape_target" ADD COLUMN "leased_until" timestamp;--> statement-breakpoint
ALTER TABLE "scrape_target" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scrape_target" ADD COLUMN "content_hash" text;--> statement-breakpoint
DROP INDEX IF EXISTS "scrape_target_live_stale_idx";--> statement-breakpoint
CREATE INDEX "scrape_target_live_stale_idx" ON "scrape_target" USING btree ("is_live","next_poll_at");--> statement-breakpoint
CREATE TABLE "ingestion_state" (
  "job" text PRIMARY KEY NOT NULL,
  "lease_until" timestamp,
  "next_run_at" timestamp,
  "last_discovery_at" timestamp,
  "next_discovery_at" timestamp,
  "last_archive_at" timestamp
);
