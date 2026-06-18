-- Run this in the Supabase SQL Editor BEFORE (or right after) deploying the
-- Manifast/Plaude feedback feature. Until this column exists, any new
-- submission that includes feedback will fail to insert.

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS feedback text DEFAULT '';
