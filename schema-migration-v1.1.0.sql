-- Run once against an existing database created before v1.1.0.
-- The four ALTER statements are intentionally separate because SQLite/D1 does
-- not support IF NOT EXISTS for ADD COLUMN. Do not run this file twice.
ALTER TABLE domains ADD COLUMN adsense_account_id INTEGER;
ALTER TABLE domains ADD COLUMN adsense_connected TEXT NOT NULL DEFAULT '未知';
ALTER TABLE domains ADD COLUMN adsense_opened_date TEXT;
ALTER TABLE domains ADD COLUMN seo_last_date TEXT;

CREATE TABLE IF NOT EXISTS adsense_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT '未知',
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adsense_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adsense_account_id INTEGER NOT NULL,
    income_month TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (adsense_account_id, income_month),
    FOREIGN KEY (adsense_account_id) REFERENCES adsense_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_domains_adsense_account ON domains(adsense_account_id);
CREATE INDEX IF NOT EXISTS idx_domains_seo_last_date ON domains(seo_last_date);
