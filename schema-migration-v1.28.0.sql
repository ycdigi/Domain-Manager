-- Preserve every join/remove episode while allowing only one active membership.
CREATE TABLE website_batch_members_next (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES website_batches(id) ON DELETE CASCADE,
    website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    member_note TEXT,
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active','removed')),
    removed_at TEXT,
    removed_reason TEXT
);
INSERT INTO website_batch_members_next SELECT id,batch_id,website_id,joined_at,member_note,membership_status,removed_at,removed_reason FROM website_batch_members;
UPDATE sqlite_sequence SET seq=MAX(seq,(SELECT seq FROM sqlite_sequence WHERE name='website_batch_members')) WHERE name='website_batch_members_next';
DROP TABLE website_batch_members;
ALTER TABLE website_batch_members_next RENAME TO website_batch_members;
CREATE UNIQUE INDEX idx_website_batch_members_active ON website_batch_members(batch_id,website_id) WHERE membership_status='active';
CREATE INDEX idx_website_batch_members_batch ON website_batch_members(batch_id,membership_status,joined_at);
CREATE INDEX idx_website_batch_members_website ON website_batch_members(website_id,membership_status);
