-- Website batches and operating scenarios. Run once after v1.22.0.
ALTER TABLE websites ADD COLUMN operating_scenario TEXT;
ALTER TABLE websites ADD COLUMN scenario_note TEXT;
ALTER TABLE websites ADD COLUMN page_count INTEGER CHECK (page_count IS NULL OR page_count >= 0);

CREATE TABLE IF NOT EXISTS website_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source TEXT,
    goal TEXT,
    hypothesis TEXT,
    status TEXT NOT NULL DEFAULT '进行中' CHECK (status IN ('进行中', '待复盘', '已复盘', '已归档')),
    review_conclusion TEXT,
    next_action TEXT,
    review_requested_at TEXT,
    reviewed_at TEXT,
    archived_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_website_batches_status ON website_batches(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS website_batch_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES website_batches(id) ON DELETE CASCADE,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    member_note TEXT,
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'removed')),
    removed_at TEXT,
    removed_reason TEXT,
    UNIQUE (batch_id, website_id, membership_status)
);
CREATE INDEX IF NOT EXISTS idx_website_batch_members_batch ON website_batch_members(batch_id, membership_status, joined_at);
CREATE INDEX IF NOT EXISTS idx_website_batch_members_website ON website_batch_members(website_id, membership_status);

CREATE TABLE IF NOT EXISTS website_batch_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES website_batches(id) ON DELETE CASCADE,
    reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    member_count INTEGER NOT NULL CHECK (member_count >= 0),
    scenario_counts TEXT NOT NULL DEFAULT '{}',
    stage_counts TEXT NOT NULL DEFAULT '{}',
    content_totals TEXT NOT NULL DEFAULT '{}',
    conclusion TEXT,
    next_action TEXT
);
CREATE INDEX IF NOT EXISTS idx_website_batch_reviews_batch ON website_batch_reviews(batch_id, reviewed_at DESC, id DESC);
