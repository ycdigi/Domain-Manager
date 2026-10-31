-- Domain Manager v1.3.0 consistency and write-volume migration.
-- Run once after v1.2.0. Back up D1 before applying.

CREATE UNIQUE INDEX IF NOT EXISTS uq_domains_normalized_name ON domains(lower(rtrim(domain, '.')));
DROP INDEX IF EXISTS idx_domains_name_normalized;
DROP INDEX IF EXISTS idx_provider_accounts_provider;
DROP INDEX IF EXISTS idx_provider_resources_account;
DROP INDEX IF EXISTS idx_domain_resources_domain;

ALTER TABLE domains ADD COLUMN last_expiry_alert_date TEXT;
ALTER TABLE domains ADD COLUMN last_offline_alert_at DATETIME;

UPDATE domains
SET resource_status = CASE WHEN EXISTS (SELECT 1 FROM domain_resources WHERE domain_id = domains.id) THEN '已关联' ELSE '未关联' END;

CREATE TRIGGER IF NOT EXISTS trg_domain_resource_insert
AFTER INSERT ON domain_resources
BEGIN
    UPDATE domains SET resource_status = '已关联' WHERE id = NEW.domain_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_domain_resource_delete
AFTER DELETE ON domain_resources
BEGIN
    UPDATE domains
    SET resource_status = CASE WHEN EXISTS (SELECT 1 FROM domain_resources WHERE domain_id = OLD.domain_id) THEN '已关联' ELSE '未关联' END
    WHERE id = OLD.domain_id;
END;

DROP INDEX IF EXISTS idx_domains_clicks;
DROP INDEX IF EXISTS idx_domains_status_check;

CREATE INDEX IF NOT EXISTS idx_domains_expiry_date ON domains(expiry_date);
CREATE INDEX IF NOT EXISTS idx_domains_notifications ON domains(domain) WHERE tgsend = 1 OR st_tgsend = 1;
