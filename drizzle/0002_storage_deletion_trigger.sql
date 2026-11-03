-- Queue object-storage keys whenever an attachment row disappears, whatever the cause
-- (message/thread/inbox/agent/user deletion, cascades, retention cleanup). The app's
-- maintenance worker deletes the queued objects from the bucket.
CREATE OR REPLACE FUNCTION agmx_queue_storage_deletion() RETURNS trigger AS $$
BEGIN
  IF OLD.storage_key IS NOT NULL THEN
    INSERT INTO storage_deletions (key) VALUES (OLD.storage_key) ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS attachments_queue_storage_deletion ON attachments;
--> statement-breakpoint
CREATE TRIGGER attachments_queue_storage_deletion
  AFTER DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION agmx_queue_storage_deletion();
