-- Run once against an existing database after v1.15.0.
ALTER TABLE websites ADD COLUMN new_site_override INTEGER CHECK (new_site_override IN (0, 1));
