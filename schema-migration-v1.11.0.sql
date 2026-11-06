-- Existing and newly created websites default to self-operated.
ALTER TABLE domains ADD COLUMN ownership TEXT NOT NULL DEFAULT '自营网站'
    CHECK (ownership IN ('未分类', '自营网站', '企业客户网站'));
CREATE INDEX IF NOT EXISTS idx_domains_ownership ON domains(ownership);
