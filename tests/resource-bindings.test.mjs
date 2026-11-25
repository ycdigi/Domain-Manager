import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const links = await server.ssrLoadModule('/functions/api/resources/links/index.ts')
const resources = await server.ssrLoadModule('/functions/api/resources/index.ts')
const accounts = await server.ssrLoadModule('/functions/api/resources/accounts/index.ts')
const store = database()
let token
const ctx = (url, body, method = 'GET') => ({ env: { DB: store.db, USER: 'test', PASS: 'secret' }, params: {}, request: new Request(`https://example.test${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
const call = async (handler, context, status = 200) => { const response = await handler(context); const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body.data }
const site = name => { store.sql('INSERT INTO websites(name) VALUES (?)', [name]); return store.sql('SELECT id FROM websites WHERE name=?', [name])[0].id }
const account = async (name, status = '正常') => store.sql('INSERT INTO provider_accounts(provider,name,status) VALUES (?,?,?) RETURNING id', ['github', name, status])[0].id
const resource = async (accountId, name, status = '正常', identifier = null) => store.sql('INSERT INTO provider_resources(account_id,provider,name,status,identifier) VALUES (?,?,?,?,?) RETURNING id', [accountId, 'github', name, status, identifier])[0].id
beforeEach(async () => { store.init(); token = await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test', 'secret') })
after(async () => { store.close(); await server.close() })

test('invalid website does not leave an auto-generated account resource', async () => {
  const accountId = await account('main')
  await call(links.onRequestPost, ctx('/api/resources/links', { website_id: 99, account_id: accountId, role: '账号归属' }, 'POST'), 400)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM provider_resources;')[0].count, 0)
})

test('website resources keep a single primary binding per role across direct writes', async () => {
  const websiteId = site('site')
  const accountId = await account('main')
  const first = await resource(accountId, 'repo-a')
  const second = await resource(accountId, 'repo-b')
  await call(links.onRequestPost, ctx('/api/resources/links', { website_id: websiteId, resource_id: first, role: '代码仓库', is_primary: true }, 'POST'), 201)
  await call(links.onRequestPost, ctx('/api/resources/links', { website_id: websiteId, resource_id: second, role: '代码仓库', is_primary: true }, 'POST'), 201)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_resources WHERE website_id=? AND is_primary=1', [websiteId])[0].count, 1)
})

test('disabled accounts and resources reject new website bindings while old links remain', async () => {
  const websiteId = site('site')
  const stoppedAccount = await account('stopped', '停用')
  const resourceId = await resource(stoppedAccount, 'stopped-resource')
  await call(links.onRequestPost, ctx('/api/resources/links', { website_id: websiteId, resource_id: resourceId, role: '代码仓库' }, 'POST'), 400)
  store.sql('INSERT INTO website_resources(website_id,resource_id,role) VALUES (?,?,?)', [websiteId, resourceId, '历史关联'])
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_resources WHERE website_id=?', [websiteId])[0].count, 1)
})

test('resource listing and account counts report associated websites', async () => {
  const websiteId = site('site'); const accountId = await account('main'); const resourceId = await resource(accountId, 'repo')
  store.sql('INSERT INTO website_resources(website_id,resource_id,role) VALUES (?,?,?)', [websiteId, resourceId, '代码仓库'])
  const listed = await call(resources.onRequestGet, ctx('/api/resources?provider=github'))
  assert.equal(listed[0].linked_website_count, 1)
  const accountRows = await call(accounts.onRequestGet, ctx('/api/resources/accounts'))
  assert.equal(accountRows[0].linked_website_count, 1)
})

test('explicit website account link preserves ownership without inventing deployment resources', async () => {
  const accountLinks = await server.ssrLoadModule('/functions/api/resources/account-links/index.ts')
  const websiteId = site('account-linked'); const accountId = await account('main')
  const linked = await call(accountLinks.onRequestPost, ctx('/api/resources/account-links', { website_id: websiteId, account_id: accountId, memo: '归属' }, 'POST'), 201)
  assert.equal(linked.account_id, accountId)
  await call(accountLinks.onRequestPost, ctx('/api/resources/account-links', { website_id: websiteId, account_id: accountId, memo: '更新' }, 'POST'), 201)
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_accounts')[0].n, 1)
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM provider_resources')[0].n, 0)
  assert.equal((await call(accounts.onRequestGet, ctx('/api/resources/accounts')))[0].linked_website_count, 1)
})

test('a non-primary binding cannot clear the current primary through a truthy flag', async () => {
 const websiteId=site('flags'),accountId=await account('flags'),first=await resource(accountId,'first'),second=await resource(accountId,'second')
 await call(links.onRequestPost,ctx('/api/resources/links',{website_id:websiteId,resource_id:first,role:'代码仓库',is_primary:true},'POST'),201)
 await call(links.onRequestPost,ctx('/api/resources/links',{website_id:websiteId,resource_id:second,role:'代码仓库',is_primary:'0'},'POST'),400)
 assert.deepEqual(store.sql('SELECT resource_id FROM website_resources WHERE is_primary=1'),[{resource_id:first}])
})

test('resource binding change keeps the previous primary when the replacement fails', async () => {
 const websiteId=site('rollback'),accountId=await account('rollback'),first=await resource(accountId,'first'),second=await resource(accountId,'second')
 await call(links.onRequestPost,ctx('/api/resources/links',{website_id:websiteId,resource_id:first,role:'代码仓库',is_primary:true,memo:'keep'},'POST'),201)
 store.sql(`CREATE TRIGGER reject_link BEFORE INSERT ON website_resources WHEN NEW.resource_id=${second} BEGIN SELECT RAISE(ABORT,'link failure'); END;`)
 await call(links.onRequestPost,ctx('/api/resources/links',{website_id:websiteId,resource_id:second,role:'代码仓库',is_primary:true},'POST'),409)
 assert.deepEqual(store.sql('SELECT resource_id,is_primary,memo FROM website_resources'),[{resource_id:first,is_primary:1,memo:'keep'}])
})

test('invalid primary flags cannot demote an existing primary resource', async () => {
 const websiteId=site('primary validation'),accountId=await account('main')
 const first=await resource(accountId,'first'),second=await resource(accountId,'second')
 await call(links.onRequestPost,ctx('/api/resources/links',{website_id:websiteId,resource_id:first,role:'代码仓库',is_primary:true},'POST'),201)
 for(const flag of ['0','false',2,{},null]) await call(links.onRequestPost,ctx('/api/resources/links',{website_id:websiteId,resource_id:second,role:'代码仓库',is_primary:flag},'POST'),400)
 assert.deepEqual(store.sql('SELECT resource_id,is_primary FROM website_resources'),[{resource_id:first,is_primary:1}])
})

test('optional resource IP values are validated for both create and update', async () => {
 const accountId=store.sql("INSERT INTO provider_accounts(provider,name) VALUES('vhost','Host') RETURNING id")[0].id
 const body={account_id:accountId,provider:'vhost',name:'Host',ip_address:'invalid'}
 await call(resources.onRequestPost,ctx('/api/resources',body,'POST'),400)
 const saved=await call(resources.onRequestPost,ctx('/api/resources',{...body,ip_address:' 203.0.113.10 '},'POST'),201)
 assert.equal(saved.ip_address,'203.0.113.10')
 const resourceDetail=await server.ssrLoadModule('/functions/api/resources/resources/[id]/index.ts')
 const update=ctx('/api/resources/resources/'+saved.id,body,'PUT');update.params.id=String(saved.id)
 await call(resourceDetail.onRequestPut,update,400)
 assert.equal(store.sql('SELECT ip_address FROM provider_resources WHERE id=?',[saved.id])[0].ip_address,'203.0.113.10')
})
