-- Upgrade v1.25.0 to the sole current data model.
-- Requires a complete SQL backup and an external archive of every removed value.
-- Run only while writes and automatic monitoring are paused.
DROP INDEX IF EXISTS idx_provider_resources_account_ownership;
DROP TRIGGER IF EXISTS trg_counts_calculator_count_canonical;
DROP TRIGGER IF EXISTS trg_counts_calculator_count_legacy;
DROP TRIGGER IF EXISTS trg_counts_calculator_count_insert;
DROP TRIGGER IF EXISTS trg_counts_article_count_canonical;
DROP TRIGGER IF EXISTS trg_counts_article_count_legacy;
DROP TRIGGER IF EXISTS trg_counts_article_count_insert;
DROP TRIGGER IF EXISTS trg_website_monitor_create;
DROP TRIGGER IF EXISTS trg_domain_monitor_insert;
DROP TRIGGER IF EXISTS trg_domain_monitor_update;
DROP TRIGGER IF EXISTS trg_domain_monitor_delete;
UPDATE websites SET calculator_count=COALESCE(calculator_count,wp_calculator_count),article_count=COALESCE(article_count,wp_article_count);
UPDATE adsense_income SET amount_usd=amount WHERE amount_usd=0 AND amount<>0;
UPDATE websites SET industry=CASE WHEN industry IS NULL OR trim(industry)='' THEN NULL WHEN industry IN ('计算器','资讯站','其他') THEN industry ELSE '其他' END;
UPDATE domains SET domain_role=CASE WHEN is_primary=1 THEN '主域名' WHEN domain_role='主域名' THEN '备用域名' ELSE domain_role END;
UPDATE website_batch_reviews SET content_totals=json_object(
 'page_count',COALESCE(json_extract(content_totals,'$.page_count'),0),
 'article_count',COALESCE(json_extract(content_totals,'$.article_count'),json_extract(content_totals,'$.wp_article_count'),0),
 'calculator_count',COALESCE(json_extract(content_totals,'$.calculator_count'),json_extract(content_totals,'$.wp_calculator_count'),0));
UPDATE website_monitors SET status='unchecked',reason=NULL,http_status=NULL,response_ms=NULL,final_url=NULL,checked_at=NULL,next_check_at='1970-01-01T00:00:00.000Z',consecutive_failures=0 WHERE status IN ('review','incomplete');
ALTER TABLE websites DROP COLUMN wp_calculator_count;
ALTER TABLE websites DROP COLUMN wp_article_count;
ALTER TABLE websites DROP COLUMN operating_scenario;
ALTER TABLE websites DROP COLUMN scenario_note;
ALTER TABLE domains DROP COLUMN computer_name;
ALTER TABLE adsense_income DROP COLUMN amount;
ALTER TABLE website_batch_reviews DROP COLUMN scenario_counts;
CREATE TABLE _cleanup_website_monitors (
    website_id INTEGER PRIMARY KEY REFERENCES websites(id) ON DELETE CASCADE,
    domain_id INTEGER,
    domain TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    allowed_redirect_hosts TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_redirect_hosts)),
    status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN ('healthy','pending','failure','unchecked')),
    reason TEXT,
    http_status INTEGER,
    response_ms INTEGER,
    final_url TEXT,
    title TEXT,
    checked_at TEXT,
    next_check_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    config_version INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT,
    lease_until TEXT
);
INSERT INTO _cleanup_website_monitors(website_id,domain_id,domain,enabled,allowed_redirect_hosts,status,reason,http_status,response_ms,final_url,title,checked_at,next_check_at,consecutive_failures,config_version,lease_token,lease_until) SELECT website_id,domain_id,domain,enabled,allowed_redirect_hosts,status,reason,http_status,response_ms,final_url,title,checked_at,next_check_at,consecutive_failures,config_version,lease_token,lease_until FROM website_monitors;
DROP TABLE website_monitors;
ALTER TABLE _cleanup_website_monitors RENAME TO website_monitors;
CREATE INDEX IF NOT EXISTS idx_monitor_due ON website_monitors(enabled, next_check_at);
CREATE TABLE _cleanup_website_monitor_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('healthy','failure')),
    reason TEXT NOT NULL,
    http_status INTEGER,
    response_ms INTEGER NOT NULL,
    final_url TEXT NOT NULL,
    title TEXT
);
INSERT INTO _cleanup_website_monitor_checks(id,website_id,domain,checked_at,outcome,reason,http_status,response_ms,final_url,title) SELECT id,website_id,domain,checked_at,outcome,reason,http_status,response_ms,final_url,title FROM website_monitor_checks WHERE outcome IN ('healthy','failure');
DROP TABLE website_monitor_checks;
ALTER TABLE _cleanup_website_monitor_checks RENAME TO website_monitor_checks;
CREATE INDEX IF NOT EXISTS idx_monitor_checks_site ON website_monitor_checks(website_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_retention ON website_monitor_checks(checked_at);
CREATE TRIGGER IF NOT EXISTS trg_website_monitor_create AFTER INSERT ON websites
BEGIN
    INSERT OR IGNORE INTO website_monitors(website_id) VALUES(NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS trg_domain_monitor_insert AFTER INSERT ON domains
BEGIN
    UPDATE website_monitor_incidents SET resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE website_id IN (NEW.website_id) AND resolved_at IS NULL
      AND domain IS NOT (SELECT d.domain FROM domains d WHERE d.website_id=website_monitor_incidents.website_id AND d.is_primary=1 LIMIT 1);
    UPDATE website_monitors SET
        domain_id=(SELECT d.id FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1),
        domain=(SELECT d.domain FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1),
        status='unchecked',reason=NULL,http_status=NULL,response_ms=NULL,final_url=NULL,title=NULL,checked_at=NULL,
        next_check_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),consecutive_failures=0,lease_token=NULL,lease_until=NULL,config_version=config_version+1
    WHERE website_id IN (NEW.website_id) AND (
        domain_id IS NOT (SELECT d.id FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1)
        OR domain IS NOT (SELECT d.domain FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1));
END;
CREATE TRIGGER IF NOT EXISTS trg_domain_monitor_update AFTER UPDATE OF domain, website_id, is_primary ON domains
BEGIN
    UPDATE website_monitor_incidents SET resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE website_id IN (OLD.website_id,NEW.website_id) AND resolved_at IS NULL
      AND domain IS NOT (SELECT d.domain FROM domains d WHERE d.website_id=website_monitor_incidents.website_id AND d.is_primary=1 LIMIT 1);
    UPDATE website_monitors SET
        domain_id=(SELECT d.id FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1),
        domain=(SELECT d.domain FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1),
        status='unchecked',reason=NULL,http_status=NULL,response_ms=NULL,final_url=NULL,title=NULL,checked_at=NULL,
        next_check_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),consecutive_failures=0,lease_token=NULL,lease_until=NULL,config_version=config_version+1
    WHERE website_id IN (OLD.website_id,NEW.website_id) AND (
        domain_id IS NOT (SELECT d.id FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1)
        OR domain IS NOT (SELECT d.domain FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1));
END;
CREATE TRIGGER IF NOT EXISTS trg_domain_monitor_delete AFTER DELETE ON domains
BEGIN
    UPDATE website_monitor_incidents SET resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE website_id IN (OLD.website_id) AND resolved_at IS NULL
      AND domain IS NOT (SELECT d.domain FROM domains d WHERE d.website_id=website_monitor_incidents.website_id AND d.is_primary=1 LIMIT 1);
    UPDATE website_monitors SET
        domain_id=(SELECT d.id FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1),
        domain=(SELECT d.domain FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1),
        status='unchecked',reason=NULL,http_status=NULL,response_ms=NULL,final_url=NULL,title=NULL,checked_at=NULL,
        next_check_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),consecutive_failures=0,lease_token=NULL,lease_until=NULL,config_version=config_version+1
    WHERE website_id IN (OLD.website_id) AND (
        domain_id IS NOT (SELECT d.id FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1)
        OR domain IS NOT (SELECT d.domain FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1));
END;
DROP TABLE IF EXISTS alertcfg;
