import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const { issueSessionToken } = await server.ssrLoadModule('/functions/utils/auth.ts')
const { validateDomain } = await server.ssrLoadModule('/functions/utils/domain-validation.ts')
const domains = await server.ssrLoadModule('/functions/api/domains/index.ts')
const edits = await server.ssrLoadModule('/functions/api/domains/[id].ts')
const imports = await server.ssrLoadModule('/functions/api/domains/import.ts')
const sync = await server.ssrLoadModule('/functions/api/ai/sync/index.ts')
const backup = await server.ssrLoadModule('/functions/api/domains/export.ts')
const snapshot = await server.ssrLoadModule('/functions/api/export/snapshot/index.ts')
const overview = await server.ssrLoadModule('/functions/api/dashboard/summary/index.ts')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'website-ownership-'))
const dbPath = path.join(directory, 'test.db')
const sql = statement => JSON.parse(execFileSync('sqlite3', ['-json', dbPath], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) || '[]')
// Execute the handlers' real SQL in SQLite; only the D1 transport is adapted.
const db = {
  prepare(statement) {
    let values = []
    const query = () => {
      let index = 0
      const result = statement.replace(/\?/g, () => {
        const value = values[index++]
        assert.notEqual(value, undefined, 'all SQL parameters must be bound')
        return value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`
      })
      assert.equal(index, values.length)
      return result
    }
    return {
      bind(...args) { values = args; return this },
      query,
      async all() { return { success: true, results: sql(query()) } },
      async first() { return sql(query())[0] || null },
      async run() { return { success: true, results: sql(query()) } }
    }
  },
  async batch(statements) {
    sql(`BEGIN;\n${statements.map(item => item.query() + ';').join('\n')}\nCOMMIT;`)
    return statements.map(() => ({ success: true }))
  }
}
const token = await issueSessionToken('test', 'test-secret')
const env = { DB: db, USER: 'test', PASS: 'test-secret', API_TOKEN: 'sync-test' }
const context = (url, body, method = 'POST', apiToken = false) => ({
  env, params: { id: '1' },
  request: new Request(`https://example.test${url}`, { method, headers: { Authorization: `Bearer ${apiToken ? env.API_TOKEN : token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
})
const website = (domain, fields = {}) => ({ domain, registrar: 'test', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '正常网站', status: '在线', platform: 'WordPress', ...fields })
const call = async (handler, ctx) => {
  const response = await handler(ctx)
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  return result.data
}
beforeEach(() => {
  fs.rmSync(dbPath, { force: true })
  sql(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
})
after(async () => { await server.close(); fs.rmSync(directory, { recursive: true, force: true }) })

test('ownership accepts three classes and rejects null, empty and unknown explicit values', () => {
  for (const ownership of ['未分类', '自营网站', '企业客户网站']) assert.equal(validateDomain(website('valid.test', { ownership })), null)
  for (const ownership of [null, '', '企业用户', 'WordPress', 1]) assert.match(validateDomain(website('valid.test', { ownership })) || '', /归属/)
  assert.equal(validateDomain(website('legacy.test')), null)
})

test('new websites default to self-operated while explicit ownership is stored', async () => {
  assert.equal((await call(domains.onRequestPost, context('/api/domains', website('self.test')))).ownership, '自营网站')
  assert.equal((await call(domains.onRequestPost, context('/api/domains', website('client.test', { ownership: '企业客户网站' })))).ownership, '企业客户网站')
})

test('full edits and inline edits preserve independent stack and site type', async () => {
  await call(domains.onRequestPost, context('/api/domains', website('edit.test', { industry: '计算器', ownership: '企业客户网站' })))
  const edited = await call(edits.onRequestPatch, context('/api/domains/1', { ownership: '未分类' }, 'PATCH'))
  assert.equal(edited.ownership, '未分类'); assert.equal(edited.platform, 'WordPress'); assert.equal(edited.industry, '计算器')
  const full = await call(edits.onRequestPut, context('/api/domains/1', website('edit.test', { ownership: '企业客户网站' }), 'PUT'))
  assert.equal(full.ownership, '企业客户网站')
  const legacy = await call(edits.onRequestPut, context('/api/domains/1', website('edit.test'), 'PUT'))
  assert.equal(legacy.ownership, '企业客户网站')
})

test('legacy import preserves existing ownership and defaults new rows to self-operated', async () => {
  await call(domains.onRequestPost, context('/api/domains', website('existing.test', { ownership: '企业客户网站' })))
  await call(imports.onRequestPost, context('/api/domains/import', [website('existing.test'), website('new.test')]))
  assert.deepEqual(sql('SELECT domain, ownership FROM domains ORDER BY id;'), [{ domain: 'existing.test', ownership: '企业客户网站' }, { domain: 'new.test', ownership: '自营网站' }])
  await call(imports.onRequestPost, context('/api/domains/import', [website('existing.test', { ownership: '未分类' })]))
  assert.equal(sql('SELECT ownership FROM domains WHERE id=1;')[0].ownership, '未分类')
})

test('AI sync changes ownership only when supplied', async () => {
  await call(domains.onRequestPost, context('/api/domains', website('sync.test', { ownership: '企业客户网站' })))
  await call(sync.onRequestPost, context('/api/ai/sync', { domain: 'sync.test', fields: { site_name: 'renamed' } }, 'POST', true))
  assert.equal(sql('SELECT ownership FROM domains;')[0].ownership, '企业客户网站')
  await call(sync.onRequestPost, context('/api/ai/sync', { domain: 'sync.test', fields: { ownership: '未分类' } }, 'POST', true))
  assert.equal(sql('SELECT ownership FROM domains;')[0].ownership, '未分类')
})

test('invalid ownership is rejected consistently before writes in every input endpoint', async () => {
  await call(domains.onRequestPost, context('/api/domains', website('valid.test', { ownership: '企业客户网站' })))
  for (const ownership of [null, '', '企业用户', 42]) {
    const requests = [
      [domains.onRequestPost, context('/api/domains', website('invalid.test', { ownership }))],
      [edits.onRequestPut, context('/api/domains/1', website('valid.test', { ownership }), 'PUT')],
      [edits.onRequestPatch, context('/api/domains/1', { ownership }, 'PATCH')],
      [imports.onRequestPost, context('/api/domains/import', [website('invalid.test', { ownership })])],
      [sync.onRequestPost, context('/api/ai/sync', { domain: 'valid.test', fields: { ownership } }, 'POST', true)]
    ]
    for (const [handler, ctx] of requests) assert.equal((await handler(ctx)).status, 400)
  }
  assert.deepEqual(sql('SELECT domain, ownership FROM domains;'), [{ domain: 'valid.test', ownership: '企业客户网站' }])
})

test('JSON backups and Excel snapshots export all ownership classes despite filter parameters', async () => {
  for (const [i, ownership] of ['自营网站', '企业客户网站', '未分类'].entries()) await call(domains.onRequestPost, context('/api/domains', website(`export${i}.test`, { ownership })))
  const ctx = context('/api/domains/export?ownership=企业客户网站', undefined, 'GET')
  const exported = await (await backup.onRequestGet(ctx)).json()
  assert.deepEqual(exported.map(item => item.ownership), ['自营网站', '企业客户网站', '未分类'])
  const exportedSnapshot = await call(snapshot.onRequestGet, context('/api/export/snapshot?ownership=企业客户网站', undefined, 'GET'))
  assert.deepEqual(exportedSnapshot.domains.map(item => item.ownership), ['自营网站', '企业客户网站', '未分类'])
  sql('DELETE FROM domains;')
  await call(imports.onRequestPost, context('/api/domains/import', exported))
  assert.deepEqual(sql('SELECT ownership FROM domains ORDER BY id;').map(item => item.ownership), ['自营网站', '企业客户网站', '未分类'])
})

test('overview intersects ownership and stack before SEO ranking and keeps account totals global', async () => {
  for (let i = 0; i < 6; i++) await call(domains.onRequestPost, context('/api/domains', website(`self${i}.test`, { seo_last_date: '2025-01-01' })))
  await call(domains.onRequestPost, context('/api/domains', website('client-wp.test', { ownership: '企业客户网站', seo_last_date: '2026-01-01', daily_clicks_range: '30to49', expiry_date: '2026-11-20' })))
  await call(domains.onRequestPost, context('/api/domains', website('client-astro.test', { ownership: '企业客户网站', platform: 'Astro', seo_last_date: '2026-01-01' })))
  sql("INSERT INTO adsense_accounts(name,owner) VALUES ('shared','owner'); INSERT INTO adsense_income(adsense_account_id,income_month,amount_usd) VALUES (1,'2026-10',123); INSERT INTO provider_accounts(provider,name) VALUES ('github','shared');")
  const data = await call(overview.onRequestGet, context('/api/dashboard/summary?today=2026-11-06&ownership=企业客户网站&platform=WordPress&q=nomatch', undefined, 'GET'))
  assert.equal(data.totals.total_domains, 1)
  assert.equal(data.totals.expiring_domains, 1)
  assert.equal(data.totals.excellent_wordpress, 1)
  assert.equal(data.totals.excellent_astro, 0)
  assert.deepEqual(data.seo.map(item => item.domain), ['client-wp.test'])
  assert.equal(data.clicks.from_30_to_49, 1)
  assert.equal(data.owner_income[0].income_usd_total, 123)
  assert.equal(data.providers.find(item => item.provider === 'github').account_count, 1)
  const empty = await call(overview.onRequestGet, context('/api/dashboard/summary?ownership=未分类', undefined, 'GET'))
  assert.equal(empty.totals.total_domains, 0); assert.deepEqual(empty.seo, [])
  for (const query of ['ownership=WordPress', 'platform=企业客户网站']) assert.equal((await overview.onRequestGet(context(`/api/dashboard/summary?${query}`, undefined, 'GET'))).status, 400)
})

test('upgrade fills legacy websites as self-operated and constrains new writes', () => {
  fs.rmSync(dbPath)
  const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').replace(/^.*ownership.*\r?\n/gm, '')
  sql(schema)
  sql("INSERT INTO domains(domain,registrar,registrar_date,expiry_date,service_type,platform,industry) VALUES ('legacy.test','r','2026-01-01','2027-01-01','正常网站','Astro','计算器');")
  const migration = new URL('../schema-migration-v1.11.0.sql', import.meta.url)
  assert.equal(fs.existsSync(migration), true, 'ownership migration must exist')
  sql(fs.readFileSync(migration, 'utf8'))
  assert.deepEqual(sql('SELECT ownership,platform,industry FROM domains;'), [{ ownership: '自营网站', platform: 'Astro', industry: '计算器' }])
  assert.throws(() => sql("UPDATE domains SET ownership='企业用户';"), /CHECK constraint failed/)
  assert.throws(() => sql('UPDATE domains SET ownership=NULL;'), /NOT NULL constraint failed/)
})
