-- Run once against an existing database after v1.12.0.
-- Telegram notification configuration and per-domain notification flags are retired.
DROP INDEX IF EXISTS idx_domains_notifications;
ALTER TABLE domains DROP COLUMN tgsend;
ALTER TABLE domains DROP COLUMN st_tgsend;
ALTER TABLE domains DROP COLUMN last_expiry_alert_date;
ALTER TABLE domains DROP COLUMN last_offline_alert_at;
DROP TABLE IF EXISTS alertcfg;
