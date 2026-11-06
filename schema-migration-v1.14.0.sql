-- Run once against an existing database after v1.13.0.
CREATE TABLE IF NOT EXISTS domain_todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_todos_domain_created ON domain_todos(domain_id, created_at DESC, id DESC);
