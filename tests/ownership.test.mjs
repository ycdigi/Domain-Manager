import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const sites = await server.ssrLoadModule('/functions/api/websites/index.ts')
const siteEdit = await server.ssrLoadModule('/functions/api/websites/[id].ts')
const sync = await server.ssrLoadModule('/functions/api/ai/sync/index.ts')
const backup = await server.ssrLoadModule('/functions/api/export/snapshot/index.ts')
const store = database()
let session
const ctx = (url, body, method = 'GET', api = false) => ({ env: { DB: store.db, USER: 'test', PASS: 'secret', API_TOKEN: 'sync' }, params: { id: '1' }, request: new Request(`https://test${url}`, { method, headers: { Authorization: `Bearer ${api ? 'sync' : session}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
const call = async (handler, context, status = 200) => { const response = await handler(context); const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body.data }
const createBody = (name, ownership = '自营网站', platform = 'Astro') => ({ name, ownership, platform, industry: '资讯站', domain: { domain: `${name.toLowerCase().replaceAll(' ', '-')}.test`, registrar: 'r', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '网站' } })
beforeEach(async () => { store.init(); session = await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test', 'secret') })
after(async () => { store.close(); await server.close() })

test('website ownership remains independent from platform and site type', async () => {
  const created = await call(sites.onRequestPost, ctx('/api/websites', createBody('Self', '企业客户网站'), 'POST'), 201)
  assert.equal(created.website.ownership, '企业客户网站')
  const changed = await call(siteEdit.onRequestPatch, ctx('/api/websites/1', { ownership: '未分类' }, 'PATCH'))
  assert.equal(changed.ownership, '未分类')
  assert.equal(changed.platform, 'Astro')
  assert.equal(changed.industry, '资讯站')
})

test('website ownership rejects invalid classifications without writing', async () => {
  await call(sites.onRequestPost, ctx('/api/websites', createBody('Valid'), 'POST'), 201)
  for (const ownership of ['', '企业用户', 'WordPress', null]) await call(siteEdit.onRequestPatch, ctx('/api/websites/1', { ownership }, 'PATCH'), 400)
  assert.equal(store.sql('SELECT ownership FROM websites WHERE id=1;')[0].ownership, '自营网站')
})

test('AI sync changes ownership only when supplied and always targets the stable website ID', async () => {
  await call(sites.onRequestPost, ctx('/api/websites', createBody('AI', '企业客户网站'), 'POST'), 201)
  await call(sync.onRequestPost, ctx('/api/ai/sync', { website_id: 1, fields: { gsc_connected: '已开通' } }, 'POST', true))
  assert.deepEqual(store.sql('SELECT ownership, gsc_connected FROM websites;'), [{ ownership: '企业客户网站', gsc_connected: '已开通' }])
  await call(sync.onRequestPost, ctx('/api/ai/sync', { website_id: 1, fields: { ownership: '未分类' } }, 'POST', true))
  assert.equal(store.sql('SELECT ownership FROM websites;')[0].ownership, '未分类')
  await call(sync.onRequestPost, ctx('/api/ai/sync', { website_id: 999, fields: { ownership: '自营网站' } }, 'POST', true), 404)
})

test('portfolio backup contains all ownership classes and their domains', async () => {
  for (const [i, ownership] of ['自营网站', '企业客户网站', '未分类'].entries()) await call(sites.onRequestPost, ctx('/api/websites', createBody(`Site ${i}`, ownership), 'POST'), 201)
  const snapshot = await call(backup.onRequestGet, ctx('/api/export/snapshot'))
  assert.deepEqual(snapshot.websites.map(site => site.ownership), ['自营网站', '企业客户网站', '未分类'])
  assert.equal(snapshot.domains.length, 3)
})
