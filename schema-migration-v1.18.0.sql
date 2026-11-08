-- Enforce source URL/template uniqueness when the optional template is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_link_sources_source_template
ON link_sources(source_url, COALESCE(url_template, ''));
