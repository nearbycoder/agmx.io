ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "last_message_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "last_message_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sending_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "threads_user_last_idx" ON "threads" USING btree ("user_id","last_message_at");