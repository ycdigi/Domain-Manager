-- Domain Manager v1.7.0 daily click ranges.
-- Run once after v1.6.0. Existing numeric values are classified conservatively.

ALTER TABLE domains ADD COLUMN daily_clicks_range TEXT;

UPDATE domains
SET daily_clicks_range = CASE
    WHEN daily_clicks IS NULL THEN NULL
    WHEN daily_clicks < 10 THEN 'under10'
    WHEN daily_clicks < 30 THEN '10to29'
    WHEN daily_clicks < 50 THEN '30to49'
    WHEN daily_clicks < 100 THEN '50to99'
    ELSE 'over100'
END
WHERE daily_clicks_range IS NULL;

CREATE INDEX IF NOT EXISTS idx_domains_clicks_range ON domains(daily_clicks_range);
