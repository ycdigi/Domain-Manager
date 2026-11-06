-- Run once against an existing database after v1.11.0.
-- Resolve any duplicate primary links or duplicate account ownership resources before running this migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_resources_one_primary
    ON domain_resources(domain_id)
    WHERE is_primary = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_resources_account_ownership
    ON provider_resources(account_id, identifier)
    WHERE account_id IS NOT NULL AND identifier LIKE 'account:%';
