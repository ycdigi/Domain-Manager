-- Account association is independent from concrete hosting and repository resources.
-- Export placeholder resource rows and their original links before applying this migration.
CREATE TABLE website_accounts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
 account_id INTEGER NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
 memo TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(website_id, account_id)
);
CREATE INDEX idx_website_accounts_account ON website_accounts(account_id);
INSERT INTO website_accounts(website_id,account_id,memo)
 SELECT wr.website_id,r.account_id,COALESCE(group_concat(NULLIF(wr.memo,''),char(10)),'')
 FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id
 WHERE r.identifier='account:'||r.account_id AND r.resource_url IS NULL AND r.ip_address IS NULL
 GROUP BY wr.website_id,r.account_id;
DELETE FROM website_resources WHERE resource_id IN (SELECT id FROM provider_resources WHERE identifier='account:'||account_id AND resource_url IS NULL AND ip_address IS NULL);
DELETE FROM provider_resources WHERE identifier='account:'||account_id AND resource_url IS NULL AND ip_address IS NULL;
