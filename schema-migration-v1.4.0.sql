-- Domain Manager v1.4.0 AI prompts and idea notes.
-- Run once after v1.3.0. Existing domain data is preserved.

CREATE TABLE IF NOT EXISTS domain_ai_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('AI提示词', '想法说明')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domain_ai_note_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('AI提示词', '想法说明')),
    content TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES domain_ai_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_ai_notes_domain ON domain_ai_notes(domain_id, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_domain_ai_note_versions_note ON domain_ai_note_versions(note_id, version_no DESC);

CREATE TRIGGER IF NOT EXISTS trg_domain_ai_notes_delete
AFTER DELETE ON domains
BEGIN
    DELETE FROM domain_ai_note_versions WHERE note_id IN (SELECT id FROM domain_ai_notes WHERE domain_id = OLD.id);
    DELETE FROM domain_ai_notes WHERE domain_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_domain_ai_note_delete
AFTER DELETE ON domain_ai_notes
BEGIN
    DELETE FROM domain_ai_note_versions WHERE note_id = OLD.id;
END;
