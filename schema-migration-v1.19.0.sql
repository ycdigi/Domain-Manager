-- Run once after v1.18.0. Keep request execution status separate from the
-- directory decision recorded by the same manual attempt. Historical direct
-- candidate outcomes are backfilled with an explicit migration note below.
ALTER TABLE link_attempts
ADD COLUMN result_status TEXT CHECK (result_status IN ('已提交待审核', '被拒绝', '来源失效'));

CREATE TRIGGER IF NOT EXISTS trg_link_attempts_result_requires_manual_completion_insert
BEFORE INSERT ON link_attempts
WHEN NEW.result_status IS NOT NULL AND (NEW.method <> '人工' OR NEW.request_status <> '已完成')
BEGIN
    SELECT RAISE(ABORT, 'result_status requires a completed manual attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_link_attempts_result_requires_manual_completion_update
BEFORE UPDATE OF method, request_status, result_status ON link_attempts
WHEN NEW.result_status IS NOT NULL AND (NEW.method <> '人工' OR NEW.request_status <> '已完成')
BEGIN
    SELECT RAISE(ABORT, 'result_status requires a completed manual attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_link_attempts_public_link_requires_evidence_insert
BEFORE INSERT ON link_attempts
WHEN NEW.confirmed_public_link = 1 AND (NEW.method <> '人工' OR NEW.request_status <> '已完成' OR NEW.result_status IS NOT NULL OR NEW.evidence_url IS NULL)
BEGIN
    SELECT RAISE(ABORT, 'public link confirmation requires an evidenced manual completion');
END;

CREATE TRIGGER IF NOT EXISTS trg_link_attempts_public_link_requires_evidence_update
BEFORE UPDATE OF method, request_status, confirmed_public_link, evidence_url ON link_attempts
WHEN NEW.confirmed_public_link = 1 AND (NEW.method <> '人工' OR NEW.request_status <> '已完成' OR NEW.result_status IS NOT NULL OR NEW.evidence_url IS NULL)
BEGIN
    SELECT RAISE(ABORT, 'public link confirmation requires an evidenced manual completion');
END;

-- Reconcile outcomes saved directly before result history was enforced.
UPDATE website_link_opportunities
SET status='请求已完成', updated_at=CURRENT_TIMESTAMP
WHERE status='已确认公开链接'
  AND NOT EXISTS (
      SELECT 1 FROM link_attempts a
      WHERE a.opportunity_id=website_link_opportunities.id
        AND a.id=(SELECT MAX(latest.id) FROM link_attempts latest WHERE latest.opportunity_id=website_link_opportunities.id)
        AND a.method='人工' AND a.request_status='已完成'
        AND a.confirmed_public_link=1 AND a.evidence_url IS NOT NULL
  );

INSERT INTO link_attempts (opportunity_id, attempted_at, method, request_status, result_status, confirmed_public_link, error_message, response_summary, evidence_url)
SELECT o.id, COALESCE(o.last_attempt_at, o.updated_at, CURRENT_TIMESTAMP), '人工', '已完成',
       CASE o.status WHEN '已提交待审核' THEN '已提交待审核' WHEN '被拒绝' THEN '被拒绝' WHEN '来源失效' THEN '来源失效' ELSE NULL END,
       0, o.last_error, 'v1.19.0 迁移补记历史候选状态：' || o.status, o.evidence_url
FROM website_link_opportunities o
WHERE o.status IN ('请求已完成', '已提交待审核', '被拒绝', '来源失效', '请求失败', '需要人工处理')
  AND NOT EXISTS (
      SELECT 1 FROM link_attempts a
      WHERE a.opportunity_id=o.id
        AND a.id=(SELECT MAX(latest.id) FROM link_attempts latest WHERE latest.opportunity_id=o.id)
        AND (
            (o.status='请求已完成' AND a.request_status='已完成' AND a.result_status IS NULL AND a.confirmed_public_link=0)
            OR (o.status='已提交待审核' AND a.request_status='已完成' AND a.result_status='已提交待审核')
            OR (o.status='被拒绝' AND a.request_status='已完成' AND a.result_status='被拒绝')
            OR (o.status='来源失效' AND a.request_status='已完成' AND a.result_status='来源失效')
            OR (o.status='请求失败' AND a.request_status='失败')
            OR (o.status='需要人工处理' AND a.request_status='需要人工')
        )
  );

UPDATE link_sources SET approval_status='已失效', enabled=0, updated_at=CURRENT_TIMESTAMP
WHERE id IN (SELECT source_id FROM website_link_opportunities WHERE status='来源失效');
UPDATE website_link_opportunities SET status='已暂停', updated_at=CURRENT_TIMESTAMP
WHERE status IN ('待处理', '已生成提交地址')
  AND source_id IN (SELECT id FROM link_sources WHERE approval_status<>'已批准' OR enabled=0);
