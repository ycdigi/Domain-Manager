-- Expand the website stage constraint without rebuilding the parent table.
-- Keep row IDs, foreign keys, triggers, credentials and the AUTOINCREMENT sequence.
ALTER TABLE websites ADD COLUMN stage_v130 TEXT NOT NULL DEFAULT '待评估'
    CHECK (stage_v130 IN ('待评估', '验证', '增长', '平稳', '下降', '维护', '暂停'));
UPDATE websites SET stage_v130 = stage;
DROP INDEX idx_websites_stage_priority;
ALTER TABLE websites DROP COLUMN stage;
ALTER TABLE websites RENAME COLUMN stage_v130 TO stage;
CREATE INDEX idx_websites_stage_priority ON websites(stage, lifecycle, priority_order);
