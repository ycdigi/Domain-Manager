import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const load = path => server.ssrLoadModule('/functions/api/' + path)
const domains = await load('domains/index.ts')
const edits = await load('domains/[id].ts')
const sync = await load('ai/sync/index.ts')
const imports = await load('domains/import.ts')
const batch = await load('domains/batch/index.ts')
const { issueSessionToken } = await server.ssrLoadModule('/functions/utils/auth.ts')
const token = await issueSessionToken('test', 'test-secret')
const store = database()
const env = { DB: store.db, USER: 'test', PASS: 'test-secret', API_TOKEN: 'sync-test' }
const website = fields => ({ domain: 'website.test', registrar: 'test', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '正常网站', status: '在线', platform: 'WordPress', ...fields })
const ctx = (url, body, method = 'POST', apiToken = false) => ({ env, params: { id: '1' }, request: new Request('https://example.test' + url, { method, headers: { Authorization: `Bearer ${apiToken ? env.API_TOKEN : token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
const row = () => store.sql('SELECT * FROM domains WHERE id=1')[0]
const create = async fields => { const response = await domains.onRequestPost(ctx('/api/domains', website(fields))); assert.equal(response.status, 200, await response.text()) }
const change = (entry, fields) => {
  if (entry === 'patch') return edits.onRequestPatch(ctx('/api/domains/1', fields, 'PATCH'))
  if (entry === 'put') return edits.onRequestPut(ctx('/api/domains/1', website(fields), 'PUT'))
  if (entry === 'sync') return sync.onRequestPost(ctx('/api/ai/sync', { domain: 'website.test', fields }, 'POST', true))
  return imports.onRequestPost(ctx('/api/domains/import', [website(fields)]))
}
beforeEach(() => store.init())
after(async () => { store.close(); await server.close() })

for (const entry of ['patch', 'put', 'sync', 'import']) {
  test(`${entry}: switching away from WordPress clears inherited content statistics`, async () => {
    await create({ wp_article_count: 12, wp_calculator_count: 3, content_stats_updated_date: '2026-11-01' })
    const response = await change(entry, { platform: 'Astro' })
    assert.equal(response.status, 200, await response.text())
    assert.equal(row().platform, 'Astro')
    for (const field of ['wp_article_count', 'wp_calculator_count', 'content_stats_updated_date']) assert.equal(row()[field], null)
  })
  test(`${entry}: explicit contradictory content statistics reject without writes`, async () => {
    await create({})
    const response = await change(entry, { platform: 'Astro', wp_article_count: 12, content_stats_updated_date: '2026-11-01' })
    assert.equal(response.status, 400)
    assert.equal(row().platform, 'WordPress')
    assert.equal(row().wp_article_count, null)
  })
  if (entry !== 'patch') test(`${entry}: a changed click range retains the supplied measurement date`, async () => {
    await create({})
    store.sql("UPDATE domains SET daily_clicks=NULL,daily_clicks_range='10to29',clicks_updated_date='2026-10-01' WHERE id=1")
    const response = await change(entry, { daily_clicks_range: 'over100', clicks_updated_date: '2026-11-01' })
    assert.equal(response.status, 200, await response.text())
    assert.equal(row().daily_clicks_range, 'over100')
    assert.equal(row().clicks_updated_date, '2026-11-01')
  })
}
test('creation preserves an explicitly dated click range', async () => {
  await create({ daily_clicks_range: '10to29', clicks_updated_date: '2026-11-01' })
  assert.equal(row().clicks_updated_date, '2026-11-01')
})
test('AI clearing a click range clears the legacy precise count as well', async () => {
  await create({ daily_clicks: 30 })
  const response = await change('sync', { daily_clicks_range: null })
  assert.equal(response.status, 200, await response.text())
  assert.equal(row().daily_clicks, null)
  assert.equal(row().daily_clicks_range, null)
  assert.equal(row().clicks_updated_date, null)
})
test('batch accepts date-only corrections without generating an empty update', async () => {
  await create({ daily_clicks: 30 })
  const response = await batch.onRequestPost(ctx('/api/domains/batch', { operations: [{ type: 'domain_patch', id: 1, fields: { clicks_updated_date: '2026-11-01' } }] }))
  assert.equal(response.status, 200, await response.text())
  assert.equal(row().daily_clicks, 30)
  assert.equal(row().clicks_updated_date, '2026-11-01')
})
test('explicit measurement dates remain editable when values are unchanged', async () => {
  await create({ daily_clicks: 30, clicks_updated_date: '2026-10-01', wp_article_count: 12, content_stats_updated_date: '2026-10-01' })
  const response = await edits.onRequestPut(ctx('/api/domains/1', website({ daily_clicks: 30, clicks_updated_date: '2026-11-01', wp_article_count: 12, content_stats_updated_date: '2026-11-02' }), 'PUT'))
  assert.equal(response.status, 200, await response.text())
  assert.equal(row().clicks_updated_date, '2026-11-01')
  assert.equal(row().content_stats_updated_date, '2026-11-02')
})
test('range-only sync preserves a legacy precise click count', async () => {
  await create({ daily_clicks: 30, daily_clicks_range: '30to49' })
  const response = await change('sync', { daily_clicks_range: '50to99' })
  assert.equal(response.status, 200, await response.text())
  assert.equal(row().daily_clicks, 30)
  assert.equal(row().daily_clicks_range, '50to99')
})
test('batch rejects an invalid status check date', async () => {
  await create({})
  const response = await batch.onRequestPost(ctx('/api/domains/batch', { operations: [{ type: 'domain_patch', id: 1, fields: { last_status_check_at: 'bad-date' } }] }))
  assert.equal(response.status, 400)
})
test('an explicit SEO-today action saves date and history together, once', async () => {
  await create({})
  for (let i=0; i<2; i++) {
    const response = await change('put', { seo_today: true })
    assert.equal(response.status, 200, await response.text())
  }
  const history = store.sql("SELECT operation_date FROM domain_operations WHERE domain_id=1 AND operation_kind='SEO'")
  assert.equal(history.length, 1)
  assert.equal(row().seo_last_date, history[0].operation_date)
})
