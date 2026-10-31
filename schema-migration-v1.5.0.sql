-- Domain Manager v1.5.0 operations, platform and AdSense publisher data.
-- Run once after v1.4.0. Back up D1 before applying.

ALTER TABLE domains ADD COLUMN platform TEXT NOT NULL DEFAULT '其他';
ALTER TABLE domains ADD COLUMN platform_other TEXT;
ALTER TABLE domains ADD COLUMN wp_calculator_count INTEGER;
ALTER TABLE domains ADD COLUMN wp_article_count INTEGER;
ALTER TABLE domains ADD COLUMN content_stats_updated_date TEXT;

ALTER TABLE adsense_accounts ADD COLUMN publisher_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_adsense_accounts_publisher_id
    ON adsense_accounts(publisher_id)
    WHERE publisher_id IS NOT NULL AND publisher_id <> '';

CREATE TABLE IF NOT EXISTS domain_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    operation_date TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN ('SEO', '内容', '技术', '其他')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (domain_id, operation_date, operation_kind),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_operations_domain_date
    ON domain_operations(domain_id, operation_date DESC);
CREATE INDEX IF NOT EXISTS idx_domains_platform ON domains(platform);
CREATE INDEX IF NOT EXISTS idx_domains_content_stats_date ON domains(content_stats_updated_date);

CREATE TRIGGER IF NOT EXISTS trg_domain_delete_operations
AFTER DELETE ON domains
BEGIN
    DELETE FROM domain_operations WHERE domain_id = OLD.id;
END;
