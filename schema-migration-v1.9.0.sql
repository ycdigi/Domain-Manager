-- Adds USD/CNY transfer metadata and optional per-domain USD breakdowns.
ALTER TABLE adsense_income ADD COLUMN amount_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE adsense_income ADD COLUMN amount_cny REAL;
ALTER TABLE adsense_income ADD COLUMN transfer_date TEXT;
UPDATE adsense_income SET amount_usd = amount WHERE amount_usd = 0 AND amount <> 0;

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
