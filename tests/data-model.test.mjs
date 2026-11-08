import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8')
const run = (db, sql) => execFileSync('sqlite3', [db], { input: sql, encoding: 'utf8' })

test('fresh schema is repeatable and owns operating data at website level', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-schema-')); const file = path.join(dir, 'db.sqlite')
  try {
    run(file, schema); run(file, schema)
    const tables = run(file, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    for (const table of ['websites', 'domains', 'website_income', 'website_effort', 'website_tasks', 'website_click_snapshots', 'website_resources', 'website_operations', 'website_ai_notes', 'adsense_accounts', 'adsense_income', 'link_sources', 'link_source_reviews', 'link_source_review_runs', 'website_link_opportunities', 'link_attempts']) assert.match(tables, new RegExp(`\\b${table}\\b`))
    for (const removed of ['domain_resources', 'domain_todos', 'domain_operations', 'adsense_income_domains']) assert.doesNotMatch(tables, new RegExp(`\\b${removed}\\b`))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('website income and effort histories enforce their natural keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-history-')); const file = path.join(dir, 'db.sqlite')
  try {
    run(file, schema)
    run(file, `INSERT INTO websites(name) VALUES ('A'); INSERT INTO website_income(website_id,income_month,source,currency,amount) VALUES (1,'2026-10','AdSense','USD',5); INSERT OR IGNORE INTO website_income(website_id,income_month,source,currency,amount) VALUES (1,'2026-10','AdSense','USD',6); INSERT INTO website_income(website_id,income_month,source,currency,amount) VALUES (1,'2026-10','Affiliate','USD',2); INSERT INTO website_effort(website_id,week_start,hours) VALUES (1,'2026-10-26',3.5); INSERT OR IGNORE INTO website_effort(website_id,week_start,hours) VALUES (1,'2026-10-26',4);`)
    assert.equal(run(file, 'SELECT COUNT(*) FROM website_income;').trim(), '2')
    assert.equal(run(file, 'SELECT hours FROM website_effort;').trim(), '3.5')
    assert.throws(() => run(file, "INSERT INTO website_income(website_id,income_month,source,currency,amount) VALUES (1,'2026-10','AdSense','EUR',-1);"), /CHECK constraint failed/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('a domain can be unassigned but a website domain references one website', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-domain-')); const file = path.join(dir, 'db.sqlite')
  try {
    run(file, `PRAGMA foreign_keys=ON;\n${schema}`)
    run(file, "INSERT INTO websites(name) VALUES ('A'); INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES (1,'a.test','r','2026-01-01','2027-01-01','网站'); INSERT INTO domains(domain,registrar,registrar_date,expiry_date,service_type) VALUES ('unassigned.test','r','2026-01-01','2027-01-01','网站');")
    assert.equal(run(file, 'SELECT COUNT(*) FROM domains WHERE website_id=1;').trim(), '1')
    assert.equal(run(file, 'SELECT COUNT(*) FROM domains WHERE website_id IS NULL;').trim(), '1')
    assert.throws(() => run(file, "PRAGMA foreign_keys=ON; INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES (404,'missing.test','r','2026-01-01','2027-01-01','网站');"), /FOREIGN KEY constraint failed/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('portable export does not select credential storage', () => {
  const source = fs.readFileSync(path.join(root, 'functions/api/export/snapshot/index.ts'), 'utf8')
  assert.doesNotMatch(source, /provider_credentials|ciphertext|CREDENTIAL_ENCRYPTION_KEY|API_TOKEN/)
  assert.match(source, /website_click_snapshots/)
  assert.match(source, /website_tasks/)
})

test('AI sync reads stable website context and does not expose secrets', () => {
  const source = fs.readFileSync(path.join(root, 'functions/api/ai/sync/index.ts'), 'utf8')
  assert.match(source, /checkApiToken/)
  assert.match(source, /website_id/)
  assert.match(source, /reviewIsDue/)
  assert.doesNotMatch(source, /provider_credentials|ciphertext|CREDENTIAL_ENCRYPTION_KEY/)
})

test('cleanup audit and workspace routes point at the portfolio implementation', () => {
  const cleanup = fs.readFileSync(path.join(root, 'scripts/lint-cleanup.mjs'), 'utf8')
  const home = fs.readFileSync(path.join(root, 'src/views/Home.vue'), 'utf8')
  assert.match(cleanup, /website_resources/)
  assert.match(home, /portfolio-stage/)
  assert.match(home, /WebsiteDetailDrawer/)
})
