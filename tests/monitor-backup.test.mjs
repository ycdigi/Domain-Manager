import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const importer = await server.ssrLoadModule('/functions/api/domains/import.ts')
const snapshot = await server.ssrLoadModule('/functions/api/export/snapshot/index.ts')
const exporter = await server.ssrLoadModule('/functions/api/domains/export.ts')
const store = database()
let token
const ctx = (body, url = '/api/domains/import') => ({ env: { DB: store.db, USER: 'test', PASS: 'secret' }, request: new Request(`https://example.test${url}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
const restore = async (body, status = 200, url) => { const response = await importer.onRequestPost(ctx(body, url)); const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result }
const backup = () => ({
  websites: [{ id: 10, name: 'Restored' }],
  domains: [{ id: 90, website_id: 10, domain: 'roundtrip.com', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站', is_primary: 1 }],
  website_monitors: [{ website_id: 10, domain_id: 90, domain: 'roundtrip.com', enabled: 0, required_text: '["Welcome"]', forbidden_text: '["parked"]', allowed_redirect_hosts: '["www.roundtrip.com"]', baseline_title: 'Original title', status: 'failure', reason: 'http_status', http_status: 503, response_ms: 12, final_url: 'https://roundtrip.com/', title: 'Unavailable', checked_at: '2026-11-11T00:00:00.000Z', next_check_at: '2099-01-01T00:00:00.000Z', consecutive_failures: 2, config_version: 4, lease_token: 'stale', lease_until: '2099-01-01T00:00:00.000Z' }],
  website_monitor_checks: [{ id: 1, website_id: 10, domain: 'roundtrip.com', checked_at: '2026-11-11T00:00:00.000Z', outcome: 'failure', reason: 'http_status', http_status: 503, response_ms: 12, final_url: 'https://roundtrip.com/', title: null, content_complete: 0 }],
  website_monitor_incidents: [{ id: 1, website_id: 10, domain: 'roundtrip.com', reason: 'http_status', opened_at: '2026-11-11T00:00:00.000Z', last_seen_at: '2026-11-11T00:05:00.000Z', resolved_at: null, read_at: '2026-11-11T00:06:00.000Z' }],
  monitor_runner: [{ id: 1, last_completed_at: '2099-01-01', lease_token: 'backup-runner', lease_until: '2099-01-01' }]
})
beforeEach(async () => { store.init(); token = await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test', 'secret') })
after(async () => { store.close(); await server.close() })

test('JSON and snapshot roundtrip monitoring, map domain IDs and release runtime leases', async () => {
  store.sql("INSERT INTO websites(id,name) VALUES(10,'Existing'); INSERT INTO domains(id,website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(7,10,'roundtrip.com','r','2026-01-01','2027-01-01','网站'); INSERT INTO monitor_runner(id,last_completed_at,lease_token,lease_until) VALUES(1,'2026-11-01','local-runner','2099-01-01');")
  const started = Date.now()
  await restore(backup())
  const row = store.sql('SELECT * FROM website_monitors')[0]
  assert.ok(row, 'monitor must be restored')
  assert.equal(row.website_id, 10); assert.equal(row.domain_id, 7)
  assert.equal(row.baseline_title, 'Original title'); assert.equal(row.enabled, 0)
  assert.equal(row.required_text, '["Welcome"]'); assert.equal(row.status, 'failure')
  assert.equal(row.lease_token, null); assert.equal(row.lease_until, null)
  assert.ok(Date.parse(row.next_check_at) >= started && Date.parse(row.next_check_at) <= Date.now())
  const runner = store.sql('SELECT * FROM monitor_runner')[0]
  assert.equal(runner.last_completed_at, '2026-11-01'); assert.equal(runner.lease_token, null); assert.equal(runner.lease_until, null)
  const payload = (await (await snapshot.onRequestGet(ctx())).json()).data
  const file = await (await exporter.onRequestGet(ctx())).json()
  for (const key of ['website_monitors', 'website_monitor_checks', 'website_monitor_incidents']) assert.deepEqual(file[key], payload[key])
  assert.equal(file.website_monitors.length, 1); assert.equal(file.website_monitor_checks[0].http_status, 503)
  assert.equal(file.website_monitor_incidents[0].read_at, '2026-11-11T00:06:00.000Z')
  assert.equal(file.monitor_runner, undefined)
  store.init(); await restore(file)
  assert.equal(store.sql('SELECT baseline_title FROM website_monitors')[0].baseline_title, 'Original title')
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM monitor_runner')[0].n, 0)
  await restore(file)
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_checks')[0].n, 1)
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_incidents')[0].n, 1)
  store.sql('DELETE FROM websites WHERE id=10')
  for (const key of ['website_monitors', 'website_monitor_checks', 'website_monitor_incidents']) assert.equal(store.sql(`SELECT COUNT(*) AS n FROM ${key}`)[0].n, 0)
})

test('a snapshot for a different primary clears the baseline and stale state', async () => {
  const input = backup()
  input.domains[0].is_primary = 0
  input.domains.push({ ...input.domains[0], id: 91, domain: 'newprimary.com', is_primary: 1 })
  await restore(input)
  const row = store.sql('SELECT * FROM website_monitors')[0]
  assert.ok(row); assert.equal(row.domain, 'newprimary.com'); assert.equal(row.baseline_title, null); assert.equal(row.status, 'unchecked')
})

test('config accepts explicit arrays and old backups without monitoring remain importable', async () => {
  const input = backup()
  input.website_monitors[0].required_text = ['Welcome']; input.website_monitors[0].enabled = true
  await restore(input)
  assert.equal(store.sql('SELECT required_text,enabled FROM website_monitors')[0].enabled, 1)
  const old = backup()
  for (const key of ['website_monitors', 'website_monitor_checks', 'website_monitor_incidents', 'monitor_runner']) delete old[key]
  await restore(old)
  assert.equal(store.sql('SELECT required_text FROM website_monitors')[0].required_text, '["Welcome"]')
})

test('invalid monitoring records reject the whole backup before changing existing data', async () => {
  const mutations = [
    b => { b.website_monitors = {} }, b => { b.website_monitors = [null] },
    b => { b.website_monitors[0].website_id = 999 }, b => { b.website_monitors[0].domain_id = 999 },
    b => { b.website_monitors[0].enabled = 2 }, b => { b.website_monitors[0].required_text = '{}' },
    b => { b.website_monitors[0].required_text = null }, b => { b.website_monitors[0].forbidden_text = '[1]' }, b => { b.website_monitors[0].allowed_redirect_hosts = '["https://bad.com"]' },
    b => { b.website_monitors[0].baseline_title = 'x'.repeat(1001) }, b => { b.website_monitors[0].status = 'bad' },
    b => { b.website_monitors.push({ ...b.website_monitors[0] }) },
    b => { b.website_monitor_checks[0].outcome = 'pending' }, b => { b.website_monitor_checks[0].response_ms = -1 },
    b => { b.website_monitor_checks[0].content_complete = 2 }, b => { b.website_monitor_checks[0].checked_at = 'bad' },
    b => { b.website_monitor_incidents[0].website_id = 999 }, b => { b.website_monitor_incidents[0].reason = {} },
    b => { b.website_monitor_incidents.push({ ...b.website_monitor_incidents[0], id: 2 }) },
    b => { b.website_monitor_checks = Array(50001).fill(b.website_monitor_checks[0]) },
    b => { b.website_monitor_incidents = Array(50001).fill(b.website_monitor_incidents[0]) }
  ]
  store.sql("INSERT INTO websites(id,name) VALUES(10,'Untouched')")
  for (const mutate of mutations) {
    const input = backup(); mutate(input); await restore(input, 400)
    assert.equal(store.sql('SELECT name FROM websites WHERE id=10')[0].name, 'Untouched')
    assert.equal(store.sql('SELECT COUNT(*) AS n FROM domains')[0].n, 0)
  }
})

test('a SQL failure rolls back monitoring and all earlier planned portfolio writes', async () => {
  store.sql("CREATE TRIGGER reject_monitor BEFORE INSERT ON website_monitor_checks BEGIN SELECT RAISE(ABORT,'test failure'); END;")
  await restore(backup(), 500)
  for (const key of ['websites', 'domains', 'website_monitors', 'website_monitor_checks', 'website_monitor_incidents']) assert.equal(store.sql(`SELECT COUNT(*) AS n FROM ${key}`)[0].n, 0)
})

test('dry run validates monitoring without writing or releasing leases', async () => {
  store.sql("INSERT INTO monitor_runner(id,lease_token) VALUES(1,'running')")
  await restore(backup(), 200, '/api/domains/import?dry_run=1')
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM websites')[0].n, 0)
  assert.equal(store.sql('SELECT lease_token FROM monitor_runner')[0].lease_token, 'running')
})


test('legacy domain arrays remain importable and release existing runtime leases', async () => {
  await restore(backup())
  store.sql("UPDATE website_monitors SET lease_token='old',lease_until='2099-01-01'; INSERT INTO monitor_runner(id,lease_token) VALUES(1,'old')")
  const legacy = backup().domains
  delete legacy[0].website_id
  await restore(legacy)
  assert.equal(store.sql('SELECT lease_token FROM website_monitors')[0].lease_token, null)
  assert.equal(store.sql('SELECT lease_token FROM monitor_runner')[0].lease_token, null)
})

const multipartContext = content => {
  const form = new FormData()
  form.append('file', new File([content], 'portfolio.json', { type: 'application/json' }))
  return { env: { DB: store.db, USER: 'test', PASS: 'secret' }, request: new Request('https://example.test/api/domains/import', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }) }
}

// Enforce invocation/binding limits while every query still runs against real SQLite.
const boundedTransport = () => {
  let queries = 0
  const consume = count => { queries += count; assert.ok(queries <= 50, `restore used ${queries} queries`) }
  return {
    prepare(sql) {
      const statement = store.db.prepare(sql)
      return { ...statement,
        async first() { consume(1); return statement.first() },
        async all() { consume(1); return statement.all() },
        async run() { consume(1); return statement.run() }
      }
    },
    async batch(statements) {
      consume(statements.length)
      for (const statement of statements) for (const value of statement.query().values) {
        if (typeof value === 'string') assert.ok(Buffer.byteLength(value) <= 512 * 1024, 'JSON binding exceeds 512 KiB')
      }
      return store.db.batch(statements)
    }
  }
}

test('100 checks and incidents roundtrip under an invocation query budget with mapped websites', async () => {
  const input = backup()
  input.websites.push({ id: 20, name: 'Second' })
  input.domains.push({ ...input.domains[0], id: 91, website_id: 20, domain: 'second.com' })
  input.website_monitor_checks = Array.from({ length: 100 }, (_, i) => ({ ...input.website_monitor_checks[0], id: i + 1, website_id: i % 2 ? 20 : 10, domain: i % 2 ? 'second.com' : 'roundtrip.com', reason: `故障 '${i}'`, response_ms: i + 0.5, title: i % 2 ? null : 'Title', content_complete: Boolean(i % 2) }))
  input.website_monitor_incidents = Array.from({ length: 100 }, (_, i) => ({ ...input.website_monitor_incidents[0], id: i + 1, website_id: i % 2 ? 20 : 10, domain: i % 2 ? 'second.com' : 'roundtrip.com', reason: `Fault ${i}`, resolved_at: '2026-11-11T00:10:00.000Z' }))
  store.sql("INSERT INTO websites(id,name) VALUES(10,'Existing'); INSERT INTO domains(id,website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(7,10,'roundtrip.com','r','2026-01-01','2027-01-01','网站');")
  const context = ctx(input); context.env.DB = boundedTransport()
  const response = await importer.onRequestPost(context)
  assert.equal(response.status, 200, await response.text())
  assert.equal(store.sql('SELECT domain_id FROM website_monitors')[0].domain_id, 7)
  const exported = await (await exporter.onRequestGet(ctx())).json()
  const fields = ['website_id', 'domain', 'reason', 'response_ms', 'title', 'content_complete']
  const checks = exported.website_monitor_checks.map(row => fields.map(key => row[key])).sort()
  const wanted = input.website_monitor_checks.map(row => fields.map(key => key === 'content_complete' ? Number(row[key]) : row[key])).sort()
  assert.deepEqual(checks, wanted)
  const incidents = exported.website_monitor_incidents.map(row => [row.website_id, row.reason, row.resolved_at, row.read_at]).sort()
  assert.deepEqual(incidents, input.website_monitor_incidents.map(row => [row.website_id, row.reason, row.resolved_at, row.read_at]).sort())
  store.init()
  const second = ctx(exported); second.env.DB = boundedTransport()
  const restored = await importer.onRequestPost(second)
  assert.equal(restored.status, 200, await restored.text())
  assert.deepEqual(store.sql('SELECT website_id,COUNT(*) AS n FROM website_monitor_checks GROUP BY website_id'), [{ website_id: 10, n: 50 }, { website_id: 20, n: 50 }])
  assert.deepEqual(store.sql('SELECT website_id,COUNT(*) AS n FROM website_monitor_incidents GROUP BY website_id'), [{ website_id: 10, n: 50 }, { website_id: 20, n: 50 }])
})

test('multipart monitoring backup above 2 MiB restores through bounded UTF-8 JSON chunks', async () => {
  const input = backup()
  input.website_monitor_checks = Array.from({ length: 400 }, (_, i) => ({ ...input.website_monitor_checks[0], id: i + 1, reason: `故障${i}` + '界'.repeat(900), title: '标题'.repeat(500) }))
  input.website_monitor_incidents = Array.from({ length: 400 }, (_, i) => ({ ...input.website_monitor_incidents[0], id: i + 1, reason: `事件${i}` + '界'.repeat(900), resolved_at: '2026-11-11T00:10:00.000Z' }))
  const content = JSON.stringify(input, null, 2)
  assert.ok(Buffer.byteLength(content) > 2 * 1024 * 1024)
  const context = multipartContext(content); context.env.DB = boundedTransport()
  const response = await importer.onRequestPost(context)
  assert.equal(response.status, 200, await response.text())
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_checks')[0].n, 400)
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_incidents')[0].n, 400)
  assert.deepEqual(store.sql('SELECT website_id,reason,title FROM website_monitor_checks ORDER BY id DESC LIMIT 1')[0], { website_id: 10, reason: input.website_monitor_checks[399].reason, title: input.website_monitor_checks[399].title })
  assert.equal(store.sql('SELECT reason FROM website_monitor_incidents ORDER BY id DESC LIMIT 1')[0].reason, input.website_monitor_incidents[399].reason)
  store.sql("CREATE TRIGGER reject_late_incident BEFORE INSERT ON website_monitor_incidents WHEN NEW.reason LIKE '事件399%' BEGIN SELECT RAISE(ABORT,'late chunk failure'); END;")
  input.websites[0].name = 'Must roll back'
  input.website_monitor_checks[0].reason = 'Must roll back'
  const failing = multipartContext(JSON.stringify(input)); failing.env.DB = boundedTransport()
  assert.equal((await importer.onRequestPost(failing)).status, 500)
  assert.equal(store.sql('SELECT name FROM websites WHERE id=10')[0].name, 'Restored')
  assert.equal(store.sql('SELECT reason FROM website_monitor_checks ORDER BY id LIMIT 1')[0].reason, '故障0' + '界'.repeat(900))
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_incidents')[0].n, 400)
})

test('multipart files above 20 MiB are rejected with a localized size limit before writes', async () => {
  const response = await importer.onRequestPost(multipartContext(' '.repeat(20 * 1024 * 1024 + 1)))
  assert.ok(!response.ok)
  assert.match((await response.json()).message, /导入文件不能超过 20 MiB/)
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM websites')[0].n, 0)
})
