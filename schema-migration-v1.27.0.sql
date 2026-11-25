-- Additive: legacy daily operation records remain unchanged.
CREATE TABLE IF NOT EXISTS gsc_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_account_email ON gsc_accounts(lower(email)) WHERE email <> '';
CREATE TABLE IF NOT EXISTS website_gsc_accounts (
    website_id INTEGER PRIMARY KEY REFERENCES websites(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES gsc_accounts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_website_gsc_account ON website_gsc_accounts(account_id);
CREATE TABLE IF NOT EXISTS website_work_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('TDK调整','计算器开发','文章开发','样式调整')),
    request_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    voided_at TEXT,
    UNIQUE(website_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_work_record_site ON website_work_records(website_id,kind,created_at DESC);
