-- Tighten public-link confirmation constraints after v1.19.0.
DROP TRIGGER IF EXISTS trg_link_attempts_public_link_requires_evidence_insert;
CREATE TRIGGER trg_link_attempts_public_link_requires_evidence_insert
BEFORE INSERT ON link_attempts
WHEN NEW.confirmed_public_link = 1 AND (NEW.method <> '人工' OR NEW.request_status <> '已完成' OR NEW.result_status IS NOT NULL OR NEW.evidence_url IS NULL)
BEGIN
    SELECT RAISE(ABORT, 'public link confirmation requires an evidenced manual completion without another result');
END;

DROP TRIGGER IF EXISTS trg_link_attempts_public_link_requires_evidence_update;
CREATE TRIGGER trg_link_attempts_public_link_requires_evidence_update
BEFORE UPDATE OF method, request_status, confirmed_public_link, evidence_url, result_status ON link_attempts
WHEN NEW.confirmed_public_link = 1 AND (NEW.method <> '人工' OR NEW.request_status <> '已完成' OR NEW.result_status IS NOT NULL OR NEW.evidence_url IS NULL)
BEGIN
    SELECT RAISE(ABORT, 'public link confirmation requires an evidenced manual completion without another result');
END;

CREATE TRIGGER IF NOT EXISTS trg_link_attempts_public_link_requires_approved_source_insert
BEFORE INSERT ON link_attempts
WHEN NEW.confirmed_public_link=1 AND NOT EXISTS (
    SELECT 1 FROM website_link_opportunities o
    JOIN link_sources s ON s.id=o.source_id
    WHERE o.id=NEW.opportunity_id AND s.approval_status='已批准' AND s.enabled=1
)
BEGIN
    SELECT RAISE(ABORT, 'public link confirmation requires an approved enabled source');
END;

CREATE TRIGGER IF NOT EXISTS trg_link_attempts_public_link_requires_approved_source_update
BEFORE UPDATE OF opportunity_id, confirmed_public_link ON link_attempts
WHEN NEW.confirmed_public_link=1 AND NOT EXISTS (
    SELECT 1 FROM website_link_opportunities o
    JOIN link_sources s ON s.id=o.source_id
    WHERE o.id=NEW.opportunity_id AND s.approval_status='已批准' AND s.enabled=1
)
BEGIN
    SELECT RAISE(ABORT, 'public link confirmation requires an approved enabled source');
END;
