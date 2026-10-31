-- Domain Manager v1.2.0 infrastructure and write-volume migration.
-- Run once against an existing D1 database after v1.1.0.

ALTER TABLE domains ADD COLUMN daily_clicks INTEGER;
ALTER TABLE domains ADD COLUMN clicks_updated_date TEXT;
ALTER TABLE domains ADD COLUMN last_status_check_at DATETIME;
ALTER TABLE domains ADD COLUMN resource_status TEXT NOT NULL DEFAULT '未检查';
CREATE INDEX IF NOT EXISTS idx_domains_clicks ON domains(daily_clicks);
CREATE INDEX IF NOT EXISTS idx_domains_status_check ON domains(last_status_check_at);

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

CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider ON provider_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_provider_resources_account ON provider_resources(account_id);
CREATE INDEX IF NOT EXISTS idx_provider_resources_provider ON provider_resources(provider);
CREATE INDEX IF NOT EXISTS idx_domain_resources_domain ON domain_resources(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_resources_resource ON domain_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_credentials_account ON provider_credentials(account_id);
