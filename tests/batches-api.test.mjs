import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const sites = await server.ssrLoadModule('/functions/api/websites/index.ts')
const batchList = await server.ssrLoadModule('/functions/api/batches/index.ts')
const batchDetail = await server.ssrLoadModule('/functions/api/batches/[id].ts')
const members = await server.ssrLoadModule('/functions/api/batches/[id]/members.ts')
const reviews = await server.ssrLoadModule('/functions/api/batches/[id]/reviews.ts')
const workQueue = await server.ssrLoadModule('/functions/api/work-queue/index.ts')
const snapshotApi = await server.ssrLoadModule('/functions/api/export/snapshot/index.ts')
const importData = await server.ssrLoadModule('/functions/api/domains/import.ts')

const store = database()
let session
const context = (url, body, method = 'GET', id = '1') => ({
  env: { DB: store.db, USER: 'test', PASS: 'secret', API_TOKEN: 'sync-token' },
  params: { id },
  request: new Request(`https://example.test${url}`, { method, headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
})
const call = async (handler, ctx, status = 200) => {
  const response = await handler(ctx)
  const body = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body.data
}
const createSite = async (name, fields = {}) => (await call(sites.onRequestPost, context('/api/websites', {
  name, domain: { domain: `${name.toLowerCase().replaceAll(' ', '-')}.test`, registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' }, ...fields
}, 'POST'), 201)).website

beforeEach(async () => {
  store.init()
  const auth = await server.ssrLoadModule('/functions/utils/auth.ts')
  session = await auth.issueSessionToken('test', 'secret')
})
after(async () => { store.close(); await server.close() })

test('website scenarios expose page count and accept custom scenario notes', async () => {
  const site = await createSite('Astro site', { operating_scenario: 'Astro 内容站', page_count: 18, scenario_note: '内容规模待复核', content_stats_updated_date: '2026-11-17' })
  assert.equal(site.operating_scenario, 'Astro 内容站')
  assert.equal(site.page_count, 18)
  assert.equal(site.scenario_note, '内容规模待复核')
  assert.equal((await call(sites.onRequestGet, context('/api/websites')))[0].page_count, 18)
  await call(sites.onRequestPost, context('/api/websites', { name: 'Bad scenario', page_count: -1, domain: { domain: 'bad-scenario.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 400)
})

test('batches support multiple members and preserve removed membership history', async () => {
  const first = await createSite('First site')
  const second = await createSite('Second site')
  const batch = await call(batchList.onRequestPost, context('/api/batches', { name: 'November experiment', source: '域名导入', goal: '验证英语需求', hypothesis: '同一批次需要比较不同技术栈' }, 'POST'), 201)
  assert.equal(batch.status, '进行中')
  await call(members.onRequestPost, context('/api/batches/1/members', { website_ids: [first.id, second.id], note: '同批次初始成员' }, 'POST'))
  const detail = await call(batchDetail.onRequestGet, context('/api/batches/1', undefined, 'GET'))
  assert.deepEqual(detail.members.map(item => item.website_id), [first.id, second.id])
  await call(members.onRequestDelete, context('/api/batches/1/members', { website_ids: [second.id], reason: '改入另一批次' }, 'DELETE'))
  assert.deepEqual(store.sql('SELECT website_id, membership_status, removed_reason FROM website_batch_members ORDER BY website_id'), [{ website_id: 1, membership_status: 'active', removed_reason: null }, { website_id: 2, membership_status: 'removed', removed_reason: '改入另一批次' }])
})

test('batch review request creates an immutable summary and changed data is flagged', async () => {
  const site = await createSite('Review site', { platform: 'WordPress', operating_scenario: 'WordPress 计算器站', wp_calculator_count: 3, wp_article_count: 8, content_stats_updated_date: '2026-11-17' })
  await call(batchList.onRequestPost, context('/api/batches', { name: 'Review batch' }, 'POST'), 201)
  await call(members.onRequestPost, context('/api/batches/1/members', { website_ids: [site.id] }, 'POST'))
  await call(reviews.onRequestPost, context('/api/batches/1/reviews', { action: 'request' }, 'POST'))
  assert.equal(store.sql('SELECT status FROM website_batches WHERE id=1')[0].status, '待复盘')
  const review = await call(reviews.onRequestPost, context('/api/batches/1/reviews', { action: 'complete', conclusion: '计算器批次值得继续', next_action: '扩大样本' }, 'POST'))
  assert.equal(review.snapshot.member_count, 1)
  assert.equal(review.snapshot.content_totals.wp_calculator_count, 3)
  assert.equal(store.sql('SELECT status FROM website_batches WHERE id=1')[0].status, '已复盘')
  store.sql("UPDATE websites SET wp_calculator_count=4 WHERE id=1")
  const detail = await call(batchDetail.onRequestGet, context('/api/batches/1', undefined, 'GET'))
  assert.equal(detail.review_changed, true)
})

test('batches with history archive instead of delete while empty batches can be deleted', async () => {
  const empty = await call(batchList.onRequestPost, context('/api/batches', { name: 'Empty batch' }, 'POST'), 201)
  await call(batchDetail.onRequestDelete, context(`/api/batches/${empty.id}`, undefined, 'DELETE', String(empty.id)))
  const keep = await call(batchList.onRequestPost, context('/api/batches', { name: 'Keep batch' }, 'POST'), 201)
  const site = await createSite('Keep site')
  await call(members.onRequestPost, context(`/api/batches/${keep.id}/members`, { website_ids: [site.id] }, 'POST', String(keep.id)))
  await call(batchDetail.onRequestDelete, context(`/api/batches/${keep.id}`, undefined, 'DELETE', String(keep.id)), 409)
  await call(batchDetail.onRequestPatch, context(`/api/batches/${keep.id}`, { status: '已归档' }, 'PATCH', String(keep.id)))
  assert.equal(store.sql('SELECT status FROM website_batches WHERE id=?', [keep.id])[0].status, '已归档')
})

test('work queue groups actionable monitor, overdue action and requested review items', async () => {
  const site = await createSite('Queue site', { next_action: '修复首页', next_action_due_date: '2020-01-01', next_action_status: '待做' })
  store.sql("UPDATE website_monitors SET status='failure', reason='timeout' WHERE website_id=1; INSERT INTO website_tasks(website_id, task_type, title, status) VALUES (1, 'SEO复查', '复查点击', '待跟进');")
  await call(batchList.onRequestPost, context('/api/batches', { name: 'Queue batch' }, 'POST'), 201)
  await call(members.onRequestPost, context('/api/batches/1/members', { website_ids: [site.id] }, 'POST'))
  await call(reviews.onRequestPost, context('/api/batches/1/reviews', { action: 'request' }, 'POST'))
  const queue = await call(workQueue.onRequestGet, context('/api/work-queue'))
  assert.equal(queue.counts.monitor, 1)
  assert.equal(queue.counts.next_action, 1)
  assert.equal(queue.counts.task, 1)
  assert.equal(queue.counts.batch, 1)
  assert.equal(queue.items.length, 4)
})

test('portfolio backup includes batches and restores their relationships', async () => {
  const site = await createSite('Backup site', { operating_scenario: 'Astro 内容站', page_count: 12, content_stats_updated_date: '2026-11-17' })
  await call(batchList.onRequestPost, context('/api/batches', { name: 'Backup batch', source: '测试' }, 'POST'), 201)
  await call(members.onRequestPost, context('/api/batches/1/members', { website_ids: [site.id], note: '保留' }, 'POST'))
  const backup = await call(snapshotApi.onRequestGet, context('/api/export/snapshot'))
  assert.equal(backup.website_batches.length, 1)
  assert.equal(backup.website_batch_members.length, 1)
  await call(importData.onRequestPost, context('/api/domains/import', backup, 'POST'))
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_batches')[0].count, 1)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_batch_members')[0].count, 1)
})
