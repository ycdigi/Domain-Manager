import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const environment = process.argv[2] || 'production'
assert(['production', 'preview'].includes(environment), 'Use production or preview')
const database = environment === 'production' ? 'domains-db' : 'domains-db-preview'
const requiredTables = [...fs.readFileSync('schema.sql', 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(match => match[1])
const queries = [
  "SELECT name FROM sqlite_schema WHERE type='table'",
  'PRAGMA table_info(websites)', 'PRAGMA table_info(prompts)', 'PRAGMA table_info(prompt_categories)',
  'PRAGMA index_list(prompts)', 'PRAGMA foreign_key_check',
  'SELECT (SELECT COUNT(*) FROM websites) AS websites, (SELECT COUNT(*) FROM domains) AS domains, (SELECT COUNT(*) FROM provider_credentials) AS credentials, (SELECT COUNT(*) FROM prompts) AS prompts, (SELECT COUNT(*) FROM prompt_categories) AS prompt_categories'
]
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', database, '--remote', '--config', 'wrangler.monitor.jsonc', '--env', environment, '--command', queries.join(';'), '--json', '--yes'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1) }
const rows = JSON.parse(result.stdout)
assert.equal(rows.length, queries.length, 'D1 did not return all verification results')
const tables = new Set(rows[0].results.map(row => row.name))
for (const name of requiredTables) assert(tables.has(name), `Missing table: ${name}`)
for (const [index, names] of [[1, ['github_push_url', 'wp_login_url', 'stage', 'new_site_override']], [2, ['id', 'category_id', 'title', 'content', 'is_favorite', 'created_at', 'updated_at']], [3, ['id', 'name', 'created_at', 'updated_at']]]) {
  const actual = new Set(rows[index].results.map(row => row.name))
  for (const name of names) assert(actual.has(name), `Missing column: ${name}`)
}
assert(rows[4].results.some(row => row.name === 'idx_prompts_category_title' && row.unique === 1), 'Prompt identity unique index missing')
assert.deepEqual(rows[5].results, [], 'Foreign key violations found')
console.log(JSON.stringify({ environment, database, required_tables: requiredTables.length, schema: 'ok', foreign_keys: 'ok', counts: rows[6].results[0] }, null, 2))
