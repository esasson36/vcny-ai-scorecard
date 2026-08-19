-- Makes deleting submissions recoverable.
--
-- Instead of removing rows, the app now stamps `archived_at`. Archived rows are
-- hidden everywhere in the UI but stay in the table, so an accidental delete
-- (or "Clear all") can be undone from Settings → Recently deleted.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the soft-delete change.

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Optional: if you ever need to restore everything by hand, this is the query.
--   UPDATE submissions SET archived_at = NULL WHERE archived_at IS NOT NULL;
