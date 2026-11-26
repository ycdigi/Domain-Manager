import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

process.umask(0o077)
const environment = process.argv[2] || 'production'
assert(['production', 'preview'].includes(environment), 'Use production or preview')
const database = environment === 'production' ? 'domains-db' : 'domains-db-preview'
const directory = path.resolve('backups')
fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
const output = path.join(directory, `${database}-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`)
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'export', database, '--remote', '--config', 'wrangler.monitor.jsonc', '--env', environment, '--output', output], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
if (fs.existsSync(output)) fs.chmodSync(output, 0o600)
// Wrangler prints a signed download URL; keep that URL out of routine logs.
if (result.status !== 0) {
  console.error(`D1 export failed for ${database}; no verified backup was produced.`)
  console.error(`${result.stdout || ''}\n${result.stderr || ''}`.replace(/https?:\/\/[^\s]+/g, '[redacted URL]'))
  process.exit(result.status || 1)
}
assert(fs.existsSync(output) && fs.statSync(output).size > 0, 'D1 export is empty')
console.log(`D1 backup saved with mode 0600: ${output}`)
