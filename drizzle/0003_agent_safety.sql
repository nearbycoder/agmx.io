CREATE TABLE "inbox_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"inbox_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "send_policy" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "approve_attachments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "inboxes" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inboxes" ADD COLUMN "max_messages" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "security" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "safe_text" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "send_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox_rules" ADD CONSTRAINT "inbox_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_rules" ADD CONSTRAINT "inbox_rules_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_rules_inbox_idx" ON "inbox_rules" USING btree ("inbox_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_idx" ON "messages" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_status_send_at_idx" ON "messages" USING btree ("status","send_at");