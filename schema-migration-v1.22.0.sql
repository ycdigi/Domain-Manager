-- Website monitoring runs in a separate Worker sharing this D1 database.
CREATE TABLE IF NOT EXISTS website_monitors (
    website_id INTEGER PRIMARY KEY REFERENCES websites(id) ON DELETE CASCADE,
    domain_id INTEGER,
    domain TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    required_text TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(required_text)),
    forbidden_text TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(forbidden_text)),
    allowed_redirect_hosts TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_redirect_hosts)),
    baseline_title TEXT,
    status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN ('healthy','pending','failure','review','incomplete','unchecked')),
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
CREATE INDEX IF NOT EXISTS idx_monitor_due ON website_monitors(enabled, next_check_at);

CREATE TABLE IF NOT EXISTS website_monitor_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('healthy','failure','review','incomplete')),
    reason TEXT NOT NULL,
    http_status INTEGER,
    response_ms INTEGER NOT NULL,
    final_url TEXT NOT NULL,
    title TEXT,
    content_complete INTEGER NOT NULL CHECK (content_complete IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_site ON website_monitor_checks(website_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_retention ON website_monitor_checks(checked_at);

CREATE TABLE IF NOT EXISTS website_monitor_incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    reason TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    resolved_at TEXT,
    read_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_open_incident ON website_monitor_incidents(website_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_monitor_unread_incidents ON website_monitor_incidents(read_at, opened_at DESC);

CREATE TABLE IF NOT EXISTS monitor_runner (
    id INTEGER PRIMARY KEY CHECK(id=1),
    last_started_at TEXT,
    last_completed_at TEXT,
    last_error TEXT,
    lease_token TEXT,
    lease_until TEXT
);

-- Seed existing websites once; ongoing maintenance is scoped to domain mutations.
INSERT OR IGNORE INTO website_monitors(website_id,domain_id,domain)
SELECT w.id,d.id,d.domain FROM websites w LEFT JOIN domains d ON d.website_id=w.id AND d.is_primary=1;

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
        baseline_title=NULL,status='unchecked',reason=NULL,http_status=NULL,response_ms=NULL,final_url=NULL,title=NULL,checked_at=NULL,
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
        baseline_title=NULL,status='unchecked',reason=NULL,http_status=NULL,response_ms=NULL,final_url=NULL,title=NULL,checked_at=NULL,
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
        baseline_title=NULL,status='unchecked',reason=NULL,http_status=NULL,response_ms=NULL,final_url=NULL,title=NULL,checked_at=NULL,
        next_check_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),consecutive_failures=0,lease_token=NULL,lease_until=NULL,config_version=config_version+1
    WHERE website_id IN (OLD.website_id) AND (
        domain_id IS NOT (SELECT d.id FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1)
        OR domain IS NOT (SELECT d.domain FROM domains d WHERE d.website_id=website_monitors.website_id AND d.is_primary=1 LIMIT 1));
END;
