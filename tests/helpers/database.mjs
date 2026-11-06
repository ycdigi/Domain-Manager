import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// Only the D1 transport is substituted: real SQLite statements and transactions run.
export const database = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-test-'))
  const file = path.join(directory, 'test.db')
  const execute = statements => JSON.parse(execFileSync('python3', ['-c', `
import sqlite3, json, sys
payload = json.load(sys.stdin)
connection = sqlite3.connect(payload['file'])
connection.row_factory = sqlite3.Row
connection.execute('PRAGMA foreign_keys=ON')
results = []
with connection:
 for item in payload['statements']:
  cursor = connection.execute(item['sql'], item['values'])
  rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
  results.append({'success': True, 'results': rows, 'meta': {'changes': max(cursor.rowcount, 0), 'last_row_id': cursor.lastrowid}})
print(json.dumps(results))
`], { input: JSON.stringify({ file, statements }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }))
  const prepare = sql => {
    let values = []
    return {
      bind(...args) { values = args; return this },
      query() { return { sql, values } },
      async all() { return execute([{ sql, values }])[0] },
      async first() { return execute([{ sql, values }])[0].results[0] || null },
      async run() { return execute([{ sql, values }])[0] }
    }
  }
  return {
    db: { prepare, async batch(statements) { return execute(statements.map(statement => statement.query())) } },
    sql(sql, values = []) {
      if (!values.length && sql.split(';').filter(part => part.trim()).length > 1) return JSON.parse(execFileSync('sqlite3', ['-json', file], { input: 'PRAGMA foreign_keys=ON;\n' + sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) || '[]')
      return execute([{ sql, values }])[0].results
    },
    script(source) { execFileSync('sqlite3', [file], { input: source, stdio: ['pipe', 'pipe', 'pipe'] }) },
    init(source = fs.readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')) {
      fs.rmSync(file, { force: true })
      execFileSync('sqlite3', [file], { input: source })
    },
    close() { fs.rmSync(directory, { recursive: true, force: true }) }
  }
}
