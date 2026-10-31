-- Run once only when upgrading a database created before st_tgsend existed.
-- Do not run this migration if the column is already present.
ALTER TABLE domains ADD COLUMN st_tgsend INTEGER DEFAULT 1;
UPDATE domains SET st_tgsend = 1 WHERE st_tgsend IS NULL;
