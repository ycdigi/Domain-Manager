-- Run once after v1.14.0. Back up the D1 database before applying.
CREATE TABLE websites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT '待评估' CHECK (stage IN ('待评估', '验证', '增长', '维护', '暂停')),
    lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'stopped')),
    ownership TEXT NOT NULL DEFAULT '自营网站' CHECK (ownership IN ('未分类', '自营网站', '企业客户网站')),
    industry TEXT,
    platform TEXT NOT NULL DEFAULT '其他',
    platform_other TEXT,
    adsense_account_id INTEGER,
    adsense_connected TEXT NOT NULL DEFAULT '未知' CHECK (adsense_connected IN ('未知', '已开通', '未开通')),
    adsense_opened_date TEXT,
    gsc_connected TEXT NOT NULL DEFAULT '未知' CHECK (gsc_connected IN ('未知', '已开通', '未开通')),
    seo_last_date TEXT,
    daily_clicks INTEGER,
    daily_clicks_range TEXT,
    clicks_updated_date TEXT,
    wp_calculator_count INTEGER,
    wp_article_count INTEGER,
    content_stats_updated_date TEXT,
    potential TEXT,
    priority_order INTEGER NOT NULL DEFAULT 0,
    next_action TEXT,
    next_action_due_date TEXT,
    next_action_status TEXT NOT NULL DEFAULT '待做' CHECK (next_action_status IN ('待做', '处理中', '已完成')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (adsense_account_id) REFERENCES adsense_accounts(id)
);

INSERT INTO websites (
    id, name, ownership, industry, platform, platform_other, adsense_account_id,
    adsense_connected, adsense_opened_date, seo_last_date, daily_clicks,
    daily_clicks_range, clicks_updated_date, wp_calculator_count, wp_article_count,
    content_stats_updated_date, created_at
)
SELECT id, COALESCE(NULLIF(site_name, ''), domain), ownership, industry, platform,
       platform_other, adsense_account_id, adsense_connected, adsense_opened_date,
       seo_last_date, daily_clicks, daily_clicks_range, clicks_updated_date,
       wp_calculator_count, wp_article_count, content_stats_updated_date, created_at
FROM domains;

ALTER TABLE domains ADD COLUMN website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE;
ALTER TABLE domains ADD COLUMN domain_role TEXT NOT NULL DEFAULT '主域名' CHECK (domain_role IN ('主域名', '跳转域名', '备用域名'));
ALTER TABLE domains ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1));
UPDATE domains SET website_id = id;
CREATE INDEX idx_domains_website ON domains(website_id);
CREATE UNIQUE INDEX idx_domains_one_primary_per_website ON domains(website_id) WHERE is_primary = 1;

CREATE INDEX idx_websites_stage_priority ON websites(stage, lifecycle, priority_order);
CREATE INDEX idx_websites_ownership ON websites(ownership);
CREATE INDEX idx_websites_platform ON websites(platform);

CREATE TABLE website_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    income_month TEXT NOT NULL,
    source TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, income_month, source, currency),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
INSERT INTO website_income (website_id, income_month, source, currency, amount, created_at)
SELECT d.website_id, i.income_month, 'AdSense', 'USD', SUM(x.amount_usd), MAX(x.created_at)
FROM adsense_income_domains x
JOIN adsense_income i ON i.id = x.income_id
JOIN domains d ON d.id = x.domain_id
GROUP BY d.website_id, i.income_month;
CREATE INDEX idx_website_income_month ON website_income(website_id, income_month DESC);

CREATE TABLE website_effort (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    week_start TEXT NOT NULL,
    hours REAL NOT NULL CHECK (hours >= 0),
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, week_start),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE website_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    task_type TEXT NOT NULL DEFAULT '其他' CHECK (task_type IN ('SEO', '内容', '技术', '其他', 'SEO复查')),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT '待做' CHECK (status IN ('待做', '处理中', '已完成', '待跟进')),
    completion_summary TEXT,
    result_url TEXT,
    due_at TEXT,
    completed_at TEXT,
    review_of_task_id INTEGER UNIQUE,
    review_delay_days INTEGER NOT NULL DEFAULT 28 CHECK (review_delay_days >= 28),
    review_window_days INTEGER NOT NULL DEFAULT 28 CHECK (review_window_days >= 1),
    review_conclusion TEXT CHECK (review_conclusion IN ('提升', '持平', '下降', '数据不足')),
    review_basis TEXT,
    baseline_missing INTEGER NOT NULL DEFAULT 0 CHECK (baseline_missing IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (review_of_task_id) REFERENCES website_tasks(id) ON DELETE CASCADE
);
CREATE INDEX idx_website_tasks_queue ON website_tasks(website_id, status, due_at, id);
CREATE INDEX idx_website_tasks_type ON website_tasks(task_type, status, due_at);

INSERT INTO website_tasks (id, website_id, task_type, title, description, status, created_at)
SELECT t.id, d.website_id, '其他', t.title, t.description, '待做', t.created_at
FROM domain_todos t JOIN domains d ON d.id = t.domain_id;

CREATE TABLE website_click_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    period_kind TEXT NOT NULL CHECK (period_kind IN ('before', 'after')),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    clicks INTEGER NOT NULL CHECK (clicks >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, period_kind),
    FOREIGN KEY (task_id) REFERENCES website_tasks(id) ON DELETE CASCADE
);

CREATE TABLE website_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT '其他',
    is_primary INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, resource_id, role),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES provider_resources(id) ON DELETE RESTRICT
);
INSERT INTO website_resources (website_id, resource_id, role, is_primary, memo, created_at)
SELECT d.website_id, dr.resource_id, dr.role, MAX(dr.is_primary), MAX(dr.memo), MIN(dr.created_at)
FROM domain_resources dr JOIN domains d ON d.id = dr.domain_id
GROUP BY d.website_id, dr.resource_id, dr.role;
CREATE UNIQUE INDEX idx_website_resources_one_primary ON website_resources(website_id) WHERE is_primary = 1;
CREATE INDEX idx_website_resources_resource ON website_resources(resource_id);

CREATE TABLE website_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    operation_date TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN ('SEO', '内容', '技术', '其他')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (website_id, operation_date, operation_kind),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO website_operations (website_id, operation_date, operation_kind, created_at)
SELECT d.website_id, o.operation_date, o.operation_kind, o.created_at
FROM domain_operations o JOIN domains d ON d.id = o.domain_id;
CREATE INDEX idx_website_operations_date ON website_operations(website_id, operation_date DESC);

CREATE TABLE website_ai_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    archived_at DATETIME,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
INSERT INTO website_ai_notes (id, website_id, kind, content, created_at, updated_at, archived_at)
SELECT n.id, d.website_id, n.kind, n.content, n.created_at, n.updated_at, n.archived_at
FROM domain_ai_notes n JOIN domains d ON d.id = n.domain_id;
CREATE TABLE website_ai_note_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    created_at DATETIME,
    FOREIGN KEY (note_id) REFERENCES website_ai_notes(id) ON DELETE CASCADE
);
INSERT INTO website_ai_note_versions (id, note_id, kind, content, version_no, created_at)
SELECT v.id, v.note_id, v.kind, v.content, v.version_no, v.created_at
FROM domain_ai_note_versions v JOIN website_ai_notes n ON n.id = v.note_id;

DROP TABLE adsense_income_domains;
DROP TABLE domain_resources;
DROP TABLE domain_operations;
DROP TABLE domain_todos;
DROP TABLE domain_ai_note_versions;
DROP TABLE domain_ai_notes;

CREATE TABLE domains_v115 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER,
    domain TEXT NOT NULL,
    registrar TEXT NOT NULL,
    registrar_link TEXT,
    registrar_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    service_type TEXT NOT NULL,
    domain_role TEXT NOT NULL DEFAULT '主域名' CHECK (domain_role IN ('主域名', '跳转域名', '备用域名')),
    is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
    status TEXT NOT NULL DEFAULT '离线' CHECK (status IN ('在线', '离线')),
    memo TEXT,
    last_status_check_at DATETIME,
    computer_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
INSERT INTO domains_v115 (id, website_id, domain, registrar, registrar_link, registrar_date, expiry_date, service_type, domain_role, is_primary, status, memo, last_status_check_at, computer_name, created_at)
SELECT id, website_id, domain, registrar, registrar_link, registrar_date, expiry_date, service_type, domain_role, is_primary, status, memo, last_status_check_at, computer_name, created_at
FROM domains;
DROP TABLE domains;
ALTER TABLE domains_v115 RENAME TO domains;
CREATE UNIQUE INDEX uq_domains_normalized_name ON domains(lower(rtrim(domain, '.')));
CREATE INDEX idx_domains_website ON domains(website_id);
CREATE INDEX idx_domains_expiry_date ON domains(expiry_date);
CREATE UNIQUE INDEX idx_domains_one_primary_per_website ON domains(website_id) WHERE is_primary = 1;

CREATE TRIGGER trg_domains_keep_last_delete
BEFORE DELETE ON domains
WHEN OLD.website_id IS NOT NULL AND EXISTS (SELECT 1 FROM websites WHERE id=OLD.website_id)
  AND (SELECT COUNT(*) FROM domains WHERE website_id=OLD.website_id) <= 1
BEGIN
    SELECT RAISE(ABORT, 'website_requires_domain');
END;
CREATE TRIGGER trg_domains_keep_last_move
BEFORE UPDATE OF website_id ON domains
WHEN OLD.website_id IS NOT NULL AND NEW.website_id IS NOT OLD.website_id
  AND EXISTS (SELECT 1 FROM websites WHERE id=OLD.website_id)
  AND (SELECT COUNT(*) FROM domains WHERE website_id=OLD.website_id) <= 1
BEGIN
    SELECT RAISE(ABORT, 'website_requires_domain');
END;
