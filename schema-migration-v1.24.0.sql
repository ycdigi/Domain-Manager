-- Upgrade v1.23.0; preserve history and legacy count aliases.
ALTER TABLE websites ADD COLUMN calculator_count INTEGER CHECK(calculator_count IS NULL OR calculator_count>=0);
ALTER TABLE websites ADD COLUMN article_count INTEGER CHECK(article_count IS NULL OR article_count>=0);
ALTER TABLE websites ADD COLUMN computer_name TEXT;
UPDATE websites SET calculator_count=wp_calculator_count, article_count=wp_article_count,
 computer_name=(SELECT computer_name FROM domains WHERE website_id=websites.id AND is_primary=1);
ALTER TABLE provider_accounts ADD COLUMN provider_name TEXT;
ALTER TABLE provider_accounts ADD COLUMN github_username TEXT;
UPDATE provider_accounts SET provider_name=CASE provider WHEN 'github' THEN 'GitHub' WHEN 'cloudflare' THEN 'Cloudflare' ELSE NULL END;
ALTER TABLE provider_credentials ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1));
UPDATE provider_credentials SET is_default=1 WHERE status='有效' AND (expires_at IS NULL OR expires_at>=date('now')) AND account_id IN
 (SELECT account_id FROM provider_credentials WHERE status='有效' AND (expires_at IS NULL OR expires_at>=date('now')) GROUP BY account_id HAVING COUNT(*)=1);
CREATE UNIQUE INDEX idx_credentials_default ON provider_credentials(account_id) WHERE is_default=1;
DROP INDEX IF EXISTS idx_website_resources_one_primary;
-- Normalize unambiguous links without deleting legacy relations or their notes.
-- Colliding legacy roles stay readable under their original role for manual review.
WITH mapped AS (
 SELECT id,website_id,resource_id,CASE
 WHEN (SELECT provider FROM provider_resources WHERE id=resource_id)='github' THEN '代码仓库'
 WHEN (SELECT provider FROM provider_resources WHERE id=resource_id) IN ('vps','vhost') THEN '托管'
 WHEN role='部署平台' THEN '托管'
 WHEN role IN ('DNS/CDN','代码仓库','托管') THEN role ELSE '其他' END AS target_role
 FROM website_resources
), unique_roles AS (
 SELECT *,COUNT(*) OVER(PARTITION BY website_id,resource_id,target_role) AS n FROM mapped
)
UPDATE website_resources SET role=(SELECT target_role FROM unique_roles WHERE id=website_resources.id)
WHERE id IN (SELECT id FROM unique_roles WHERE n=1);
CREATE UNIQUE INDEX idx_website_resources_one_primary ON website_resources(website_id,role) WHERE is_primary=1;

CREATE TABLE IF NOT EXISTS domain_favicons (
    domain_id INTEGER PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
    source_domain TEXT NOT NULL,
    source_url TEXT,
    image_data TEXT,
    mime_type TEXT,
    content_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','failure')),
    fetched_at TEXT,
    last_attempt_at TEXT,
    retry_after TEXT,
    last_error TEXT
);
CREATE TRIGGER IF NOT EXISTS trg_counts_calculator_count_canonical AFTER UPDATE OF calculator_count ON websites
WHEN NEW.calculator_count IS NOT NEW.wp_calculator_count
BEGIN UPDATE websites SET wp_calculator_count=NEW.calculator_count WHERE id=NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_counts_calculator_count_legacy AFTER UPDATE OF wp_calculator_count ON websites
WHEN NEW.wp_calculator_count IS NOT NEW.calculator_count
BEGIN UPDATE websites SET calculator_count=NEW.wp_calculator_count WHERE id=NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_counts_calculator_count_insert AFTER INSERT ON websites
BEGIN UPDATE websites SET calculator_count=COALESCE(NEW.calculator_count,NEW.wp_calculator_count), wp_calculator_count=COALESCE(NEW.calculator_count,NEW.wp_calculator_count) WHERE id=NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_counts_article_count_canonical AFTER UPDATE OF article_count ON websites
WHEN NEW.article_count IS NOT NEW.wp_article_count
BEGIN UPDATE websites SET wp_article_count=NEW.article_count WHERE id=NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_counts_article_count_legacy AFTER UPDATE OF wp_article_count ON websites
WHEN NEW.wp_article_count IS NOT NEW.article_count
BEGIN UPDATE websites SET article_count=NEW.wp_article_count WHERE id=NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_counts_article_count_insert AFTER INSERT ON websites
BEGIN UPDATE websites SET article_count=COALESCE(NEW.article_count,NEW.wp_article_count), wp_article_count=COALESCE(NEW.article_count,NEW.wp_article_count) WHERE id=NEW.id; END;
