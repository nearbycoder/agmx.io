ALTER TABLE "agents" ADD COLUMN "sending_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "sending_paused_reason" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "reputation_since" timestamp with time zone;