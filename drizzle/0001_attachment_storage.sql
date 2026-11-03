CREATE TABLE "storage_deletions" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD COLUMN "dropped" integer DEFAULT 0 NOT NULL;