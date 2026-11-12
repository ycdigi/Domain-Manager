-- Initial schema for new D1 databases. Upgrade existing databases with versioned migrations.

CREATE TABLE IF NOT EXISTS websites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT '待评估' CHECK (stage IN ('待评估', '验证', '增长', '维护', '暂停')),
    lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'stopped')),
    ownership TEXT NOT NULL DEFAULT '自营网站' CHECK (ownership IN ('未分类', '自营网站', '企业客户网站')),
    industry TEXT,
    platform TEXT NOT NULL DEFAULT '其他',
    platform_other TEXT,
    adsense_account_id INTEGER,
    adsense_connected TEXT NOT NULL DEFAULT '未知' CHECK (adsense_connected IN ('未知', '已开通', '未开通')),
    adsense_opened_date TEXT,
    gsc_connected TEXT NOT NULL DEFAULT '未知' CHECK (gsc_connected IN ('未知', '已开通', '未开通')),
    seo_last_date TEXT,
    daily_clicks INTEGER,
    daily_clicks_range TEXT,
    clicks_updated_date TEXT,
    wp_calculator_count INTEGER,
    wp_article_count INTEGER,
    content_stats_updated_date TEXT,
    potential TEXT,
    priority_order INTEGER NOT NULL DEFAULT 0,
    next_action TEXT,
    next_action_due_date TEXT,
    next_action_status TEXT NOT NULL DEFAULT '待做' CHECK (next_action_status IN ('待做', '处理中', '已完成')),
    new_site_override INTEGER CHECK (new_site_override IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (adsense_account_id) REFERENCES adsense_accounts(id)
);

CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER,
    domain TEXT NOT NULL,
    registrar TEXT NOT NULL,
    registrar_link TEXT,
    registrar_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    service_type TEXT NOT NULL,
    domain_role TEXT NOT NULL DEFAULT '主域名' CHECK (domain_role IN ('主域名', '跳转域名', '备用域名')),
    is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
    status TEXT NOT NULL DEFAULT '离线' CHECK (status IN ('在线', '离线')),
    memo TEXT,
    last_status_check_at DATETIME,
    computer_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_domains_normalized_name ON domains(lower(rtrim(domain, '.')));
CREATE INDEX IF NOT EXISTS idx_domains_website ON domains(website_id);
CREATE INDEX IF NOT EXISTS idx_domains_expiry_date ON domains(expiry_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_one_primary_per_website ON domains(website_id) WHERE is_primary = 1;
CREATE INDEX IF NOT EXISTS idx_websites_stage_priority ON websites(stage, lifecycle, priority_order);
CREATE INDEX IF NOT EXISTS idx_websites_ownership ON websites(ownership);
CREATE INDEX IF NOT EXISTS idx_websites_platform ON websites(platform);

CREATE TRIGGER IF NOT EXISTS trg_domains_keep_last_delete
BEFORE DELETE ON domains
WHEN OLD.website_id IS NOT NULL AND EXISTS (SELECT 1 FROM websites WHERE id=OLD.website_id)
  AND (SELECT COUNT(*) FROM domains WHERE website_id=OLD.website_id) <= 1
BEGIN
    SELECT RAISE(ABORT, 'website_requires_domain');
END;
CREATE TRIGGER IF NOT EXISTS trg_domains_keep_last_move
BEFORE UPDATE OF website_id ON domains
WHEN OLD.website_id IS NOT NULL AND NEW.website_id IS NOT OLD.website_id
  AND EXISTS (SELECT 1 FROM websites WHERE id=OLD.website_id)
  AND (SELECT COUNT(*) FROM domains WHERE website_id=OLD.website_id) <= 1
BEGIN
    SELECT RAISE(ABORT, 'website_requires_domain');
END;

CREATE TABLE IF NOT EXISTS adsense_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT '未知',
    publisher_id TEXT,
    opened_date TEXT,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_adsense_accounts_publisher_id ON adsense_accounts(publisher_id) WHERE publisher_id IS NOT NULL AND publisher_id <> '';

CREATE TABLE IF NOT EXISTS adsense_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adsense_account_id INTEGER NOT NULL,
    income_month TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    amount_usd REAL NOT NULL DEFAULT 0,
    amount_cny REAL,
    transfer_date TEXT,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (adsense_account_id, income_month),
    FOREIGN KEY (adsense_account_id) REFERENCES adsense_accounts(id)
);

CREATE TABLE IF NOT EXISTS website_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    income_month TEXT NOT NULL,
    source TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, income_month, source, currency),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_website_income_month ON website_income(website_id, income_month DESC);

CREATE TABLE IF NOT EXISTS website_effort (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    week_start TEXT NOT NULL,
    hours REAL NOT NULL CHECK (hours >= 0),
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, week_start),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL CHECK (provider IN ('github', 'cloudflare', 'vhost', 'vps')),
    name TEXT NOT NULL,
    login_email TEXT,
    status TEXT NOT NULL DEFAULT '正常',
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, name)
);
CREATE TABLE IF NOT EXISTS provider_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    provider TEXT NOT NULL CHECK (provider IN ('github', 'cloudflare', 'vhost', 'vps')),
    name TEXT NOT NULL,
    resource_url TEXT,
    identifier TEXT,
    ip_address TEXT,
    port INTEGER,
    region TEXT,
    status TEXT NOT NULL DEFAULT '正常',
    expires_at TEXT,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, name),
    FOREIGN KEY (account_id) REFERENCES provider_accounts(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS provider_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    token_last4 TEXT,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT '有效',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES provider_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_provider_resources_provider ON provider_resources(provider);
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_resources_account_ownership ON provider_resources(account_id, identifier) WHERE account_id IS NOT NULL AND identifier LIKE 'account:%';
CREATE INDEX IF NOT EXISTS idx_credentials_account ON provider_credentials(account_id);

CREATE TABLE IF NOT EXISTS website_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT '其他',
    is_primary INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, resource_id, role),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES provider_resources(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_resources_one_primary ON website_resources(website_id) WHERE is_primary = 1;
CREATE INDEX IF NOT EXISTS idx_website_resources_resource ON website_resources(resource_id);

CREATE TABLE IF NOT EXISTS website_ai_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('AI提示词', '想法说明')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS website_ai_note_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('AI提示词', '想法说明')),
    content TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES website_ai_notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_website_ai_notes_site ON website_ai_notes(website_id, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_website_ai_note_versions_note ON website_ai_note_versions(note_id, version_no DESC);

CREATE TABLE IF NOT EXISTS website_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    operation_date TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN ('SEO', '内容', '技术', '其他')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, operation_date, operation_kind),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_website_operations_date ON website_operations(website_id, operation_date DESC);

CREATE TABLE IF NOT EXISTS website_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    task_type TEXT NOT NULL DEFAULT '其他' CHECK (task_type IN ('SEO', '内容', '技术', '其他', 'SEO复查')),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT '待做' CHECK (status IN ('待做', '处理中', '已完成', '待跟进')),
    completion_summary TEXT,
    result_url TEXT,
    due_at TEXT,
    completed_at TEXT,
    review_of_task_id INTEGER UNIQUE,
    review_delay_days INTEGER NOT NULL DEFAULT 28 CHECK (review_delay_days >= 28),
    review_window_days INTEGER NOT NULL DEFAULT 28 CHECK (review_window_days >= 1),
    review_conclusion TEXT CHECK (review_conclusion IN ('提升', '持平', '下降', '数据不足')),
    review_basis TEXT,
    baseline_missing INTEGER NOT NULL DEFAULT 0 CHECK (baseline_missing IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (review_of_task_id) REFERENCES website_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_website_tasks_queue ON website_tasks(website_id, status, due_at, id);
CREATE INDEX IF NOT EXISTS idx_website_tasks_type ON website_tasks(task_type, status, due_at);

CREATE TABLE IF NOT EXISTS website_click_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    period_kind TEXT NOT NULL CHECK (period_kind IN ('before', 'after')),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    clicks INTEGER NOT NULL CHECK (clicks >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, period_kind),
    FOREIGN KEY (task_id) REFERENCES website_tasks(id) ON DELETE CASCADE
);
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
