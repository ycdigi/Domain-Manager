-- Safe initial schema for a new or existing D1 database.
-- This file is intentionally repeatable: it never drops existing domain data.

CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    registrar TEXT NOT NULL,
    registrar_link TEXT,
    registrar_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    service_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '离线',
    tgsend INTEGER DEFAULT 0,
    st_tgsend INTEGER DEFAULT 1,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alertcfg (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_token TEXT NOT NULL,
    tg_userid TEXT NOT NULL,
    days INTEGER NOT NULL DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
