-- Remove the retired external-link feature and all of its production data.
DROP TABLE IF EXISTS link_attempts;
DROP TABLE IF EXISTS website_link_opportunities;
DROP TABLE IF EXISTS link_source_reviews;
DROP TABLE IF EXISTS link_source_review_runs;
DROP TABLE IF EXISTS link_sources;
