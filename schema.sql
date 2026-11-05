-- Initial schema for a new D1 database. Upgrade existing databases with the
-- versioned migration files instead of applying this file over an older schema.

CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    registrar TEXT NOT NULL,
    registrar_link TEXT,
    registrar_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    service_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '离线',
    tgsend INTEGER DEFAULT 0,
    st_tgsend INTEGER DEFAULT 1,
    memo TEXT,
    site_name TEXT,
    industry TEXT,
    adsense_account_id INTEGER,
    adsense_connected TEXT NOT NULL DEFAULT '未知',
    adsense_opened_date TEXT,
    seo_last_date TEXT,
    daily_clicks INTEGER,
    daily_clicks_range TEXT,
    clicks_updated_date TEXT,
    platform TEXT NOT NULL DEFAULT '其他',
    platform_other TEXT,
    wp_calculator_count INTEGER,
    wp_article_count INTEGER,
    content_stats_updated_date TEXT,
    last_status_check_at DATETIME,
    last_expiry_alert_date TEXT,
    last_offline_alert_at DATETIME,
    resource_status TEXT NOT NULL DEFAULT '未关联',
    computer_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alertcfg (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_token TEXT NOT NULL,
    tg_userid TEXT NOT NULL,
    days INTEGER NOT NULL DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS adsense_income_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    income_id INTEGER NOT NULL,
    domain_id INTEGER NOT NULL,
    amount_usd REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (income_id, domain_id),
    FOREIGN KEY (income_id) REFERENCES adsense_income(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_adsense_income_domains_income ON adsense_income_domains(income_id);
CREATE INDEX IF NOT EXISTS idx_adsense_income_domains_domain ON adsense_income_domains(domain_id);

CREATE INDEX IF NOT EXISTS idx_domains_adsense_account ON domains(adsense_account_id);
CREATE INDEX IF NOT EXISTS idx_domains_seo_last_date ON domains(seo_last_date);
CREATE INDEX IF NOT EXISTS idx_domains_expiry_date ON domains(expiry_date);
CREATE INDEX IF NOT EXISTS idx_domains_platform ON domains(platform);
CREATE INDEX IF NOT EXISTS idx_domains_content_stats_date ON domains(content_stats_updated_date);
CREATE INDEX IF NOT EXISTS idx_domains_industry ON domains(industry);
CREATE INDEX IF NOT EXISTS idx_domains_site_name ON domains(site_name);
CREATE INDEX IF NOT EXISTS idx_domains_clicks_range ON domains(daily_clicks_range);
CREATE UNIQUE INDEX IF NOT EXISTS uq_adsense_accounts_publisher_id
    ON adsense_accounts(publisher_id)
    WHERE publisher_id IS NOT NULL AND publisher_id <> '';
CREATE INDEX IF NOT EXISTS idx_domains_notifications ON domains(domain) WHERE tgsend = 1 OR st_tgsend = 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_domains_normalized_name ON domains(lower(rtrim(domain, '.')));

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

CREATE TABLE IF NOT EXISTS domain_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT '其他',
    is_primary INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (domain_id, resource_id, role),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES provider_resources(id) ON DELETE RESTRICT
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

CREATE TABLE IF NOT EXISTS domain_ai_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('AI提示词', '想法说明')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domain_ai_note_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('AI提示词', '想法说明')),
    content TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES domain_ai_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_provider_resources_provider ON provider_resources(provider);
CREATE INDEX IF NOT EXISTS idx_domain_resources_resource ON domain_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_credentials_account ON provider_credentials(account_id);
CREATE INDEX IF NOT EXISTS idx_domain_ai_notes_domain ON domain_ai_notes(domain_id, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_domain_ai_note_versions_note ON domain_ai_note_versions(note_id, version_no DESC);

CREATE TABLE IF NOT EXISTS domain_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    operation_date TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN ('SEO', '内容', '技术', '其他')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (domain_id, operation_date, operation_kind),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_operations_domain_date ON domain_operations(domain_id, operation_date DESC);

CREATE TRIGGER IF NOT EXISTS trg_domain_ai_notes_delete
AFTER DELETE ON domains
BEGIN
    DELETE FROM domain_ai_note_versions WHERE note_id IN (SELECT id FROM domain_ai_notes WHERE domain_id = OLD.id);
    DELETE FROM domain_ai_notes WHERE domain_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_domain_ai_note_delete
AFTER DELETE ON domain_ai_notes
BEGIN
    DELETE FROM domain_ai_note_versions WHERE note_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_domain_delete_operations
AFTER DELETE ON domains
BEGIN
    DELETE FROM domain_operations WHERE domain_id = OLD.id;
END;

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
