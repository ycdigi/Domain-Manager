-- Run once against an existing database after v1.16.0.
CREATE TABLE IF NOT EXISTS link_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT '无法判断' CHECK (source_type IN ('搜索页', 'SEO 查询页', '工具目录', '行业资源页', '社区页面', '可能的提交页', '无法判断')),
    country TEXT,
    language TEXT,
    topic_tags TEXT,
    url_template TEXT,
    submission_mode TEXT NOT NULL DEFAULT '仅观察' CHECK (submission_mode IN ('人工提交', '允许自动处理', '仅观察')),
    approval_status TEXT NOT NULL DEFAULT '待审核' CHECK (approval_status IN ('待审核', '已批准', '已暂停', '已拒绝', '已失效')),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    audit_flags TEXT,
    last_checked_at DATETIME,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_url, url_template)
);
CREATE INDEX IF NOT EXISTS idx_link_sources_review ON link_sources(approval_status, enabled, source_type);
CREATE INDEX IF NOT EXISTS idx_link_sources_country_language ON link_sources(country, language);

CREATE TABLE IF NOT EXISTS website_link_opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    target_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '待审核' CHECK (status IN ('待审核', '待处理', '已生成提交地址', '请求已完成', '已提交待审核', '已确认公开链接', '被拒绝', '来源失效', '请求失败', '需要人工处理', '已暂停')),
    submission_url TEXT,
    title TEXT,
    description TEXT,
    anchor_text TEXT,
    next_run_at DATETIME,
    last_attempt_at DATETIME,
    evidence_url TEXT,
    last_error TEXT,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, source_id, target_url),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES link_sources(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_link_opportunities_queue ON website_link_opportunities(status, next_run_at, id);
CREATE INDEX IF NOT EXISTS idx_link_opportunities_website ON website_link_opportunities(website_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_opportunities_source ON website_link_opportunities(source_id, status);

CREATE TABLE IF NOT EXISTS link_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER NOT NULL,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    method TEXT NOT NULL CHECK (method IN ('人工', '自动')),
    request_status TEXT NOT NULL CHECK (request_status IN ('已完成', '失败', '需要人工')),
    http_status INTEGER,
    confirmed_public_link INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_public_link IN (0, 1)),
    error_message TEXT,
    response_summary TEXT,
    evidence_url TEXT,
    FOREIGN KEY (opportunity_id) REFERENCES website_link_opportunities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_link_attempts_opportunity ON link_attempts(opportunity_id, attempted_at DESC);
