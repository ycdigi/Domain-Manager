-- Source review funnel state is kept separately from approval and opportunity data.
CREATE TABLE IF NOT EXISTS link_source_reviews (
    source_id INTEGER PRIMARY KEY,
    funnel_stage TEXT NOT NULL DEFAULT '未检查' CHECK (funnel_stage IN ('未检查', '待筛选', '建议保留', '已保留', '待删除', '已排除')),
    check_status TEXT NOT NULL DEFAULT '未检查' CHECK (check_status IN ('未检查', '可访问', '重定向', '404', '受阻', '超时', '错误', '需要人工验证')),
    http_status INTEGER CHECK (http_status IS NULL OR (http_status BETWEEN 100 AND 599)),
    checked_url TEXT,
    error_message TEXT,
    checked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES link_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_link_source_reviews_funnel ON link_source_reviews(funnel_stage, check_status, checked_at DESC);

CREATE TABLE IF NOT EXISTS link_source_review_runs (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    planned_count INTEGER NOT NULL DEFAULT 0 CHECK (planned_count >= 0),
    completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    status TEXT NOT NULL DEFAULT '未运行' CHECK (status IN ('未运行', '运行中', '已完成', '部分完成', '失败')),
    started_at DATETIME,
    completed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
