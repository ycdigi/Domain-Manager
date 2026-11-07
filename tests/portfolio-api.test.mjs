import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const sites = await server.ssrLoadModule('/functions/api/websites/index.ts')
const siteEdit = await server.ssrLoadModule('/functions/api/websites/[id].ts')
const tasks = await server.ssrLoadModule('/functions/api/websites/[id]/tasks/index.ts')
const taskEdit = await server.ssrLoadModule('/functions/api/websites/[id]/tasks/[task_id].ts')
const domains = await server.ssrLoadModule('/functions/api/domains/index.ts')
const domainEdit = await server.ssrLoadModule('/functions/api/domains/[id].ts')
const domainBatch = await server.ssrLoadModule('/functions/api/domains/batch/index.ts')
const income = await server.ssrLoadModule('/functions/api/websites/[id]/income/index.ts')
const effort = await server.ssrLoadModule('/functions/api/websites/[id]/effort/index.ts')
const notes = await server.ssrLoadModule('/functions/api/websites/[id]/ai-notes/index.ts')
const note = await server.ssrLoadModule('/functions/api/websites/[id]/ai-notes/[note_id]/index.ts')
const operations = await server.ssrLoadModule('/functions/api/websites/[id]/operations/index.ts')
const sync = await server.ssrLoadModule('/functions/api/ai/sync/index.ts')
const importData = await server.ssrLoadModule('/functions/api/domains/import.ts')
const snapshotApi = await server.ssrLoadModule('/functions/api/export/snapshot/index.ts')
const context = (url, body, method = 'GET', apiToken = false, id = '1') => ({
  env: { DB: store.db, USER: 'test', PASS: 'secret', API_TOKEN: 'sync-token' },
  params: { id, task_id: '1', note_id: '1', operation_id: '1' },
  request: new Request(`https://example.test${url}`, { method, headers: { Authorization: `Bearer ${apiToken ? 'sync-token' : session}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
})
const store = database()
let session
const payload = response => response.json()
const call = async (handler, ctx, status = 200) => {
  const response = await handler(ctx)
  const body = await payload(response)
  assert.equal(response.status, status, JSON.stringify(body))
  return body.data
}
beforeEach(async () => {
  store.init()
  const auth = await server.ssrLoadModule('/functions/utils/auth.ts')
  session = await auth.issueSessionToken('test', 'secret')
})
after(async () => { store.close(); await server.close() })

test('website creation requires and stores its first domain', async () => {
  const created = await call(sites.onRequestPost, context('/api/websites', { name: 'New site', domain: { domain: 'new.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  assert.equal(created.website.id, 1)
  assert.equal(created.website.stage, '待评估')
  assert.equal(created.domains.length, 1)
  await call(sites.onRequestPost, context('/api/websites', { name: 'No domain' }, 'POST'), 400)
})

test('a website cannot lose its final domain through domain deletion', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Keep', domain: { domain: 'keep.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  await call(domainEdit.onRequestDelete, context('/api/domains/1', undefined, 'DELETE'), 409)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM domains;')[0].count, 1)
})

test('website profile accepts known service status while protecting click date requirements', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Profile', daily_clicks: 12, clicks_updated_date: '2026-11-01', domain: { domain: 'profile.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  await call(siteEdit.onRequestPatch, context('/api/websites/1', { daily_clicks: 24 }, 'PATCH'), 400)
  await call(siteEdit.onRequestPatch, context('/api/websites/1', { adsense_connected: '已开通' }, 'PATCH'))
  await call(sync.onRequestPost, context('/api/ai/sync', { website_id: 1, fields: { adsense_connected: '未开通', gsc_connected: '已开通' } }, 'POST', true))
  assert.deepEqual(store.sql('SELECT adsense_connected, gsc_connected FROM websites;'), [{ adsense_connected: '未开通', gsc_connected: '已开通' }])
  await call(siteEdit.onRequestPatch, context('/api/websites/1', { industry: '工程站' }, 'PATCH'), 400)
  assert.deepEqual(store.sql('SELECT name, daily_clicks FROM websites;'), [{ name: 'Profile', daily_clicks: 12 }])
})

test('legacy website types display as other without changing stored values', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Legacy type', industry: '其他', domain: { domain: 'legacy-type.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  store.sql("UPDATE websites SET industry='电气/工程' WHERE id=1;")
  const portfolio = await call(sites.onRequestGet, context('/api/websites'))
  const aiContext = await call(sync.onRequestGet, context('/api/ai/sync?website_id=1', undefined, 'GET', true))
  assert.equal(portfolio[0].industry, '其他')
  assert.equal(aiContext.website.industry, '其他')
  assert.equal(store.sql('SELECT industry FROM websites WHERE id=1;')[0].industry, '电气/工程')
})

test('editing a legacy website without changing its type succeeds and preserves the original value', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Legacy edit', industry: '其他', domain: { domain: 'legacy-edit.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  store.sql("UPDATE websites SET industry='电气/工程' WHERE id=1;")
  await call(siteEdit.onRequestPatch, context('/api/websites/1', { name: 'Renamed legacy site', industry: '其他' }, 'PATCH'))
  assert.deepEqual(store.sql('SELECT name, industry FROM websites WHERE id=1;'), [{ name: 'Renamed legacy site', industry: '电气/工程' }])
  await call(siteEdit.onRequestPatch, context('/api/websites/1', { industry: '新无效分类' }, 'PATCH'), 400)
  await call(sync.onRequestPost, context('/api/ai/sync', { website_id: 1, fields: { industry: '其他', gsc_connected: '已开通' } }, 'POST', true))
  assert.deepEqual(store.sql('SELECT industry, gsc_connected FROM websites WHERE id=1;'), [{ industry: '电气/工程', gsc_connected: '已开通' }])
})

test('portfolio backup round-trip accepts and preserves legacy website types', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Legacy backup', industry: '其他', domain: { domain: 'legacy-backup.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  store.sql("UPDATE websites SET industry='电气/工程' WHERE id=1;")
  const backup = await call(snapshotApi.onRequestGet, context('/api/export/snapshot'))
  assert.equal(backup.websites[0].industry, '电气/工程')
  await call(importData.onRequestPost, context('/api/domains/import', backup, 'POST'))
  assert.equal(store.sql('SELECT industry FROM websites WHERE id=1;')[0].industry, '电气/工程')
})

test('the offline status queue only writes validated domain status fields', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Status', domain: { domain: 'status.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  await call(domainBatch.onRequestPost, context('/api/domains/batch', { operations: [{ type: 'domain_patch', id: 1, fields: { status: '在线', last_status_check_at: '2026-11-01' } }] }, 'POST'))
  assert.deepEqual(store.sql('SELECT status, last_status_check_at FROM domains WHERE id=1;'), [{ status: '在线', last_status_check_at: '2026-11-01' }])
  await call(domainBatch.onRequestPost, context('/api/domains/batch', { operations: [{ type: 'domain_patch', id: 1, fields: { registrar: 'changed' } }] }, 'POST'), 400)
})

test('domain assets include unassigned domains and keep domain-only fields separate', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Domains', domain: { domain: 'assigned.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  await call(domains.onRequestPost, context('/api/domains', { domain: 'unassigned.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' }, 'POST'), 201)
  const rows = await call(domains.onRequestGet, context('/api/domains'))
  assert.deepEqual(rows.map(row => row.domain).sort(), ['assigned.test', 'unassigned.test'])
  assert.equal(rows.find(row => row.domain === 'unassigned.test').website_id, null)
})

test('legacy import attaches an existing unassigned domain and retains asset fields', async () => {
  const asset = { domain: 'legacy.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站', computer_name: 'Workstation', industry: '电气/工程' }
  await call(domains.onRequestPost, context('/api/domains', asset, 'POST'), 201)
  await call(importData.onRequestPost, context('/api/domains/import', [{ ...asset, site_name: 'Legacy website' }], 'POST'))
  assert.deepEqual(store.sql('SELECT name, stage, industry FROM websites;'), [{ name: 'Legacy website', stage: '待评估', industry: '电气/工程' }])
  assert.deepEqual(store.sql('SELECT website_id, computer_name FROM domains;'), [{ website_id: 1, computer_name: 'Workstation' }])
  await call(importData.onRequestPost, context('/api/domains/import', [{ ...asset, site_name: 'Legacy website' }], 'POST'))
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM websites;')[0].count, 1)
})

test('an unassigned domain can be attached, but a website keeps at least one domain', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Attach', domain: { domain: 'attach.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  const original = store.sql("SELECT id FROM domains WHERE domain='attach.test';")[0].id
  const detached = await call(domains.onRequestPost, context('/api/domains', { domain: 'free.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' }, 'POST'), 201)
  await call(domainEdit.onRequestPatch, context(`/api/domains/${detached.id}`, { website_id: 1 }, 'PATCH', false, String(detached.id)))
  assert.equal(store.sql('SELECT website_id FROM domains WHERE domain=?', ['free.test'])[0].website_id, 1)
  assert.deepEqual(store.sql("SELECT id,domain,website_id FROM domains ORDER BY id;"), [{ id: original, domain: 'attach.test', website_id: 1 }, { id: detached.id, domain: 'free.test', website_id: 1 }])
  await call(domainEdit.onRequestPatch, context(`/api/domains/${original}`, { website_id: null }, 'PATCH', false, String(original)))
  await call(domainEdit.onRequestPatch, context(`/api/domains/${detached.id}`, { website_id: null }, 'PATCH', false, String(detached.id)), 409)
})

test('website prompt notes keep version history and operations under stable website IDs', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Notes', domain: { domain: 'notes.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  const created = await call(notes.onRequestPost, context('/api/websites/1/ai-notes', { kind: 'AI提示词', content: '第一版' }, 'POST'), 201)
  await call(note.onRequestPut, context(`/api/websites/1/ai-notes/${created.id}`, { kind: 'AI提示词', content: '第二版' }, 'PUT'))
  const versions = await call(note.onRequestGet, context(`/api/websites/1/ai-notes/${created.id}`))
  assert.deepEqual(versions.map(item => item.content), ['第二版', '第一版'])
  await call(operations.onRequestPost, context('/api/websites/1/operations', { operation_date: '2026-11-01', operation_kind: 'SEO' }, 'POST'), 201)
  assert.equal(store.sql('SELECT website_id FROM website_operations;')[0].website_id, 1)
})

test('completing an SEO task creates one 28-day follow-up and records an optional baseline', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'SEO site', domain: { domain: 'seo.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  const task = await call(tasks.onRequestPost, context('/api/websites/1/tasks', { task_type: 'SEO', title: 'Improve page', review_window_days: 28, baseline: { period_start: '2026-01-01', period_end: '2026-01-28', clicks: 30 } }, 'POST'), 201)
  await call(taskEdit.onRequestPut, context(`/api/websites/1/tasks/${task.id}`, { review_window_days: 0 }, 'PUT'), 400)
  const completed = await call(taskEdit.onRequestPut, context(`/api/websites/1/tasks/${task.id}`, { status: '已完成', completed_at: '2026-02-01' }, 'PUT'))
  assert.equal(completed.status, '已完成')
  assert.equal(store.sql("SELECT COUNT(*) AS count FROM website_tasks WHERE task_type='SEO复查' AND review_of_task_id=?", [task.id])[0].count, 1)
  assert.deepEqual(store.sql('SELECT period_kind, clicks FROM website_click_snapshots WHERE task_id=(SELECT id FROM website_tasks WHERE review_of_task_id=?);', [task.id]), [{ period_kind: 'before', clicks: 30 }])
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_click_snapshots WHERE period_kind=\'before\';')[0].count, 1)
  await call(taskEdit.onRequestPut, context(`/api/websites/1/tasks/${task.id}`, { status: '已完成', completed_at: '2026-02-01' }, 'PUT'))
  assert.equal(store.sql("SELECT COUNT(*) AS count FROM website_tasks WHERE task_type='SEO复查' AND review_of_task_id=?", [task.id])[0].count, 1)
})

test('invalid SEO baseline is rejected before a task is created', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Bad baseline', domain: { domain: 'bad-baseline.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  await call(tasks.onRequestPost, context('/api/websites/1/tasks', { task_type: 'SEO', title: 'Bad window', baseline: { period_start: '2026-01-01', period_end: '2026-01-27', clicks: 2 } }, 'POST'), 400)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_tasks;')[0].count, 0)
})

test('website income and weekly effort preserve independent history', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Money', domain: { domain: 'money.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  const row = await call(income.onRequestPost, context('/api/websites/1/income', { income_month: '2026-10', source: 'Affiliate', currency: 'EUR', amount: 12.5 }, 'POST'), 201)
  assert.equal(row.amount, 12.5)
  const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())
  for (const item of [{ source: 'AdSense', currency: 'USD', amount: 7 }, { source: 'Affiliate', currency: 'EUR', amount: 9 }]) await call(income.onRequestPost, context('/api/websites/1/income', { income_month: currentMonth, ...item }, 'POST'), 201)
  const portfolio = await call(sites.onRequestGet, context('/api/websites'))
  assert.deepEqual(portfolio[0].current_income.sort((a, b) => a.currency.localeCompare(b.currency)), [{ source: 'Affiliate', currency: 'EUR', amount: 9 }, { source: 'AdSense', currency: 'USD', amount: 7 }])
  assert.equal((await call(income.onRequestGet, context('/api/websites/1/income'))).length, 3)
  await call(effort.onRequestPost, context('/api/websites/1/effort', { week_start: '2026-10-26', hours: 4.5 }, 'POST'), 201)
  await call(effort.onRequestPost, context('/api/websites/1/effort', { week_start: '2026-11-02', hours: 2 }, 'POST'), 201)
  assert.deepEqual(store.sql('SELECT week_start, hours FROM website_effort WHERE website_id=1 ORDER BY week_start;'), [{ week_start: '2026-10-26', hours: 4.5 }, { week_start: '2026-11-02', hours: 2 }])
})

test('a task can use its own waiting period and equal comparison windows', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Custom review', domain: { domain: 'custom-review.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  const task = await call(tasks.onRequestPost, context('/api/websites/1/tasks', { title: 'Custom', task_type: 'SEO', review_delay_days: 35, review_window_days: 7, baseline: { period_start: '1999-12-25', period_end: '1999-12-31', clicks: 10 } }, 'POST'), 201)
  await call(taskEdit.onRequestPut, context('/api/websites/1/tasks/1', { status: '已完成', completed_at: '2000-01-01' }, 'PUT'))
  const review = store.sql('SELECT id, due_at, review_window_days FROM website_tasks WHERE review_of_task_id=?', [task.id])[0]
  assert.equal(review.due_at, '2000-02-05')
  assert.equal(review.review_window_days, 7)
  const result = await call(sync.onRequestPost, context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: review.id, review: { after: { period_start: '2000-01-30', period_end: '2000-02-05', clicks: 15 }, conclusion: '提升', basis: '相等的 7 天窗口：10 → 15 次' } }] }, 'POST', true))
  assert.deepEqual(result.applied.tasks, [review.id])
})

test('AI sync addresses a stable website and rejects review conclusions before due date', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'AI', domain: { domain: 'ai.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  await call(tasks.onRequestPost, context('/api/websites/1/tasks', { task_type: 'SEO', title: 'AI task' }, 'POST'), 201)
  await call(taskEdit.onRequestPut, context('/api/websites/1/tasks/1', { status: '已完成', completed_at: '2026-11-01' }, 'PUT'))
  const early = await sync.onRequestPost(context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: 2, review: { after: { period_start: '2026-11-01', period_end: '2026-11-28', clicks: 12 }, conclusion: '提升' } }] }, 'POST', true))
  assert.equal(early.status, 409)
  const partial = await sync.onRequestPost(context('/api/ai/sync', { website_id: 1, fields: { gsc_connected: '已开通' }, task_updates: [{ task_id: 2, review: { after: { period_start: '2026-11-01', period_end: '2026-11-28', clicks: 12 }, conclusion: '提升' } }] }, 'POST', true))
  assert.equal(partial.status, 200)
  assert.deepEqual(store.sql('SELECT gsc_connected, name FROM websites WHERE id=1;'), [{ gsc_connected: '已开通', name: 'AI' }])
  assert.equal(store.sql('SELECT review_conclusion FROM website_tasks WHERE id=2;')[0].review_conclusion, null)
  const unknown = await sync.onRequestPost(context('/api/ai/sync', { website_id: 999, fields: { gsc_connected: '已开通' } }, 'POST', true))
  assert.equal(unknown.status, 404)
  const byDomain = await sync.onRequestGet(context('/api/ai/sync?domain=ai.test', undefined, 'GET', true))
  assert.equal((await payload(byDomain)).data.website.id, 1)
})

test('a review without comparison data remains pending when there is no baseline', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'No baseline', domain: { domain: 'no-baseline.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  const review = store.sql("INSERT INTO website_tasks (website_id, task_type, title, status, due_at, baseline_missing) VALUES (1, 'SEO复查', '复查：旧任务', '待跟进', '2000-01-28', 1) RETURNING id;")[0]
  await call(taskEdit.onRequestPut, { ...context(`/api/websites/1/tasks/${review.id}`, { status: '已完成' }, 'PUT'), params: { id: '1', task_id: String(review.id) } }, 400)
  await call(sync.onRequestPost, context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: review.id, status: '已完成' }] }, 'POST', true), 400)
  const reviewContext = context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: review.id, review: { conclusion: '数据不足', basis: '没有修改前基线' } }] }, 'POST', true)
  await call(sync.onRequestPost, reviewContext)
  assert.equal(store.sql('SELECT status FROM website_tasks WHERE id=?', [review.id])[0].status, '待跟进')
  const withClicks = context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: review.id, review: { after: { period_start: '2000-01-01', period_end: '2000-01-28', clicks: 0 }, conclusion: '数据不足', basis: '缺少修改前点击基线' } }] }, 'POST', true)
  await call(sync.onRequestPost, withClicks)
  assert.equal(store.sql('SELECT status FROM website_tasks WHERE id=?', [review.id])[0].status, '已完成')
  assert.equal(store.sql("SELECT baseline_missing FROM website_tasks WHERE id=?", [review.id])[0].baseline_missing, 1)
  assert.equal(store.sql("SELECT period_kind, clicks FROM website_click_snapshots WHERE task_id=?", [review.id])[0].period_kind, 'after')
})

test('a review needs a real baseline for directional conclusions and reports saved review IDs', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'Review', domain: { domain: 'review.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  const task = store.sql("INSERT INTO website_tasks (website_id, task_type, title, due_at, baseline_missing) VALUES (1,'SEO复查','Review','2000-01-28',1) RETURNING id;")[0]
  const after = { period_start: '2000-01-01', period_end: '2000-01-28', clicks: 10 }
  await call(sync.onRequestPost, context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: task.id, review: { after, conclusion: '提升', basis: '假设之前更低' } }] }, 'POST', true), 400)
  store.sql("INSERT INTO website_click_snapshots (task_id,period_kind,period_start,period_end,clicks) VALUES (?,'before','1999-12-01','1999-12-28',5)", [task.id])
  const applied = await call(sync.onRequestPost, context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: task.id, review: { after, conclusion: '提升', basis: '前后各 28 天，5 → 10 次' } }] }, 'POST', true))
  assert.deepEqual(applied.applied.tasks, [task.id])
  assert.equal(store.sql('SELECT status FROM website_tasks WHERE id=?', [task.id])[0].status, '已完成')
})

test('AI completion of an existing SEO task creates the same follow-up as manual completion', async () => {
  await call(sites.onRequestPost, context('/api/websites', { name: 'AI completion', domain: { domain: 'ai-complete.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  await call(tasks.onRequestPost, context('/api/websites/1/tasks', { task_type: 'SEO', title: 'Fix headings' }, 'POST'), 201)
  await call(sync.onRequestPost, context('/api/ai/sync', { website_id: 1, task_updates: [{ task_id: 1, status: '已完成', completion_summary: '标题已更新', result_url: 'https://ai-complete.test', baseline: { period_start: '2026-10-10', period_end: '2026-11-06', clicks: 55 } }] }, 'POST', true))
  const followup = store.sql("SELECT title, due_at FROM website_tasks WHERE review_of_task_id=1;")[0]
  assert.equal(followup.title, '复查：Fix headings')
  assert.equal(followup.due_at, '2026-12-05')
  assert.equal(store.sql("SELECT clicks FROM website_click_snapshots WHERE task_id=(SELECT id FROM website_tasks WHERE review_of_task_id=1) AND period_kind='before';")[0]?.clicks, 55)
})

test('portfolio backup snapshot restores websites, domains, tasks, income and effort', async () => {
  store.sql("INSERT INTO adsense_accounts (name, owner) VALUES ('main', 'self');")
  await call(sites.onRequestPost, context('/api/websites', { name: 'Backup', domain: { domain: 'backup.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } }, 'POST'), 201)
  store.sql("UPDATE websites SET adsense_account_id=1, adsense_connected='已开通', adsense_opened_date='2026-02-01' WHERE id=1;")
  await call(domains.onRequestPost, context('/api/domains', { domain: 'free-backup.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' }, 'POST'), 201)
  await call(tasks.onRequestPost, context('/api/websites/1/tasks', { task_type: '内容', title: 'Write article' }, 'POST'), 201)
  await call(tasks.onRequestPost, context('/api/websites/1/tasks', { task_type: '内容', title: 'Write article', description: 'Second article' }, 'POST'), 201)
  await call(notes.onRequestPost, context('/api/websites/1/ai-notes', { kind: 'AI提示词', content: 'Backup note' }, 'POST'), 201)
  store.sql("INSERT INTO provider_accounts (provider,name) VALUES ('github','Backup account'); INSERT INTO provider_resources (account_id,provider,name,identifier) VALUES (1,'github','Backup repo','account:1'); INSERT INTO website_resources(website_id,resource_id,role,is_primary) VALUES(1,1,'代码仓库',1);")
  await call(income.onRequestPost, context('/api/websites/1/income', { income_month: '2026-10', source: 'AdSense', currency: 'USD', amount: 10 }, 'POST'), 201)
  await call(effort.onRequestPost, context('/api/websites/1/effort', { week_start: '2026-10-26', hours: 3 }, 'POST'), 201)
  const backup = await call(snapshotApi.onRequestGet, context('/api/export/snapshot', undefined, 'GET'))
  backup.websites[0].adsense_account_id = 99
  backup.adsense_accounts[0].id = 99
  store.sql('DELETE FROM websites;')
  await call(importData.onRequestPost, context('/api/domains/import', backup, 'POST'))
  assert.equal(store.sql("SELECT name FROM websites WHERE name='Backup';")[0].name, 'Backup')
  assert.equal(store.sql("SELECT domain FROM domains WHERE domain='backup.test';")[0].domain, 'backup.test')
  assert.equal(store.sql("SELECT website_id FROM domains WHERE domain='free-backup.test';")[0].website_id, null)
  assert.equal(store.sql("SELECT title FROM website_tasks WHERE title='Write article';")[0].title, 'Write article')
  assert.deepEqual(store.sql('SELECT id, description FROM website_tasks ORDER BY id;'), [{ id: 1, description: null }, { id: 2, description: 'Second article' }])
  assert.equal(store.sql("SELECT amount FROM website_income WHERE source='AdSense';")[0].amount, 10)
  assert.equal(store.sql('SELECT hours FROM website_effort WHERE website_id=1;')[0].hours, 3)
  assert.equal(store.sql('SELECT adsense_account_id FROM websites WHERE id=1;')[0].adsense_account_id, 1)
  assert.equal(store.sql('SELECT content FROM website_ai_notes;')[0].content, 'Backup note')
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_ai_note_versions;')[0].count, 1)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_resources WHERE website_id=1;')[0].count, 1)
  await call(importData.onRequestPost, context('/api/domains/import', backup, 'POST'))
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_tasks;')[0].count, 2)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_ai_note_versions;')[0].count, 1)
})

test('a backup failure rolls back every website and history write in that import', async () => {
  const data = {
    websites: [{ id: 10, name: 'Invalid backup' }],
    domains: [{ id: 10, website_id: 10, domain: 'atomic.test', registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站', status: '在线' }],
    website_income: [{ website_id: 10, income_month: '2026-11', source: 'Bad', currency: 'USD', amount: -1 }]
  }
  const response = await importData.onRequestPost(context('/api/domains/import', data, 'POST'))
  assert.ok(response.status >= 400)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM websites;')[0].count, 0)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM domains;')[0].count, 0)
})
