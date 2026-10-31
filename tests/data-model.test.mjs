import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runSql = (db, sql) => execFileSync('sqlite3', [db], { input: sql, encoding: 'utf8' })

test('schema is repeatable and includes resource tables', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/schema.db'
  try {
    const schema = fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8')
    runSql(db, schema)
    runSql(db, schema)
    const tables = runSql(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").trim().split('\n')
    assert.ok(tables.includes('provider_accounts'))
    assert.ok(tables.includes('provider_resources'))
    assert.ok(tables.includes('domain_resources'))
    assert.ok(tables.includes('provider_credentials'))
    assert.ok(tables.includes('domain_ai_notes'))
    assert.ok(tables.includes('domain_ai_note_versions'))
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('dashboard and domain lookups use their supporting indexes', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/query-plan.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    const seoPlan = runSql(db, 'EXPLAIN QUERY PLAN SELECT id, domain, seo_last_date FROM domains ORDER BY seo_last_date ASC LIMIT 5;')
    const linksPlan = runSql(db, 'EXPLAIN QUERY PLAN SELECT COUNT(*) FROM domain_resources WHERE domain_id=1;')
    const domainPlan = runSql(db, "EXPLAIN QUERY PLAN SELECT id FROM domains WHERE lower(rtrim(domain, '.'))='example.com';")
    assert.match(seoPlan, /idx_domains_seo_last_date/)
    assert.match(linksPlan, /sqlite_autoindex_domain_resources_1/)
    assert.match(domainPlan, /uq_domains_normalized_name/)
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('resource link triggers keep derived domain status accurate', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/links.db'
  try {
    runSql(db, 'PRAGMA foreign_keys=ON;')
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com', 'test', '2025-01-01', '2027-01-01', '正常网站'); INSERT INTO provider_accounts(provider, name) VALUES ('github', 'source'); INSERT INTO provider_resources(account_id, provider, name) VALUES (1, 'github', 'repo'); INSERT INTO domain_resources(domain_id, resource_id, role) VALUES (1, 1, '代码仓库');`)
    assert.equal(runSql(db, 'SELECT resource_status FROM domains WHERE id=1;').trim(), '已关联')
    runSql(db, 'DELETE FROM domain_resources WHERE id=1;')
    assert.equal(runSql(db, 'SELECT resource_status FROM domains WHERE id=1;').trim(), '未关联')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('AI notes keep current records and version history, and domain deletion cascades', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/ai-notes.db'
  try {
    runSql(db, 'PRAGMA foreign_keys=ON;')
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com', 'test', '2025-01-01', '2027-01-01', '正常网站'); INSERT INTO domain_ai_notes(domain_id, kind, content) VALUES (1, 'AI提示词', '检查入口页'); INSERT INTO domain_ai_note_versions(note_id, kind, content, version_no) VALUES (1, 'AI提示词', '检查入口页', 1); UPDATE domain_ai_notes SET content='检查入口页和内链', updated_at=CURRENT_TIMESTAMP WHERE id=1; INSERT INTO domain_ai_note_versions(note_id, kind, content, version_no) VALUES (1, 'AI提示词', '检查入口页和内链', 2);`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_notes WHERE archived_at IS NULL;').trim(), '1')
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_note_versions WHERE note_id=1;').trim(), '2')
    runSql(db, 'DELETE FROM domains WHERE id=1;')
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_notes;').trim(), '0')
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_note_versions;').trim(), '0')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('income is unique per AdSense account and month', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/income.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner) VALUES ('main', 'self'); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5);`)
    runSql(db, `INSERT OR IGNORE INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 2);`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM adsense_income;').trim(), '1')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('dashboard income remains one account-month total when it has multiple sites', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/dashboard.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner) VALUES ('main', 'self'); INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type, adsense_account_id) VALUES ('one.example', 'r', '2025-01-01', '2027-01-01', 'normal', 1), ('two.example', 'r', '2025-01-01', '2027-01-01', 'normal', 1); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5);`)
    const row = runSql(db, `SELECT COALESCE((SELECT SUM(i.amount) FROM adsense_income i WHERE i.adsense_account_id=a.id AND i.income_month='2026-10'),0) || '|' || (SELECT COUNT(DISTINCT d.id) FROM domains d WHERE d.adsense_account_id=a.id) FROM adsense_accounts a;`).trim()
    assert.equal(row, '12.5|2')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('income can be totaled by owner and currency across multiple accounts', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/owner-income.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner, currency) VALUES ('main', 'self', 'USD'), ('second', 'self', 'USD'), ('euro', 'self', 'EUR'); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5), (2, '2026-10', 7.5), (3, '2026-10', 3);`)
    const result = runSql(db, `SELECT owner || '|' || currency || '|' || SUM(i.amount) FROM adsense_accounts a LEFT JOIN adsense_income i ON i.adsense_account_id=a.id AND i.income_month='2026-10' GROUP BY owner, currency ORDER BY currency;`).trim().split('\n')
    assert.deepEqual(result, ['self|EUR|3.0', 'self|USD|20.0'])
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('normalized domains are unique across case and trailing dots', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/domain-unique.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('Example.com', 'test', '2025-01-01', '2027-01-01', '正常网站'); INSERT OR IGNORE INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com.', 'test', '2025-01-01', '2027-01-01', '正常网站');`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domains;').trim(), '1')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('v1.1 through v1.3 migrations preserve existing domains', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/migration.db'
  try {
    runSql(db, `CREATE TABLE domains (id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL, registrar TEXT NOT NULL, registrar_link TEXT, registrar_date TEXT NOT NULL, expiry_date TEXT NOT NULL, service_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT '离线', tgsend INTEGER DEFAULT 0, st_tgsend INTEGER DEFAULT 1, memo TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP); INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('legacy.example.com', 'test', '2025-01-01', '2026-12-31', '正常网站');`)
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.1.0.sql'), 'utf8'))
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.2.0.sql'), 'utf8'))
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.3.0.sql'), 'utf8'))
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.4.0.sql'), 'utf8'))
    const row = runSql(db, "SELECT domain || '|' || adsense_connected || '|' || resource_status FROM domains;").trim()
    assert.equal(row, 'legacy.example.com|未知|未关联')
    const alertColumns = runSql(db, 'PRAGMA table_info(domains);')
    assert.match(alertColumns, /last_expiry_alert_date/)
    assert.match(alertColumns, /last_offline_alert_at/)
    const aiTables = runSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'domain_ai_note%';")
    assert.match(aiTables, /domain_ai_notes/)
    assert.match(aiTables, /domain_ai_note_versions/)
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})
