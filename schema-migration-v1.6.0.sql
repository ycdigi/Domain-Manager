-- Domain Manager v1.6.0 site identity fields.
-- Run once after v1.5.0. Existing domains keep empty values until maintained manually.

ALTER TABLE domains ADD COLUMN site_name TEXT;
ALTER TABLE domains ADD COLUMN industry TEXT;

CREATE INDEX IF NOT EXISTS idx_domains_site_name ON domains(site_name);
CREATE INDEX IF NOT EXISTS idx_domains_industry ON domains(industry);
