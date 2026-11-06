import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const links = await server.ssrLoadModule('/functions/api/resources/links/index.ts')
const resources = await server.ssrLoadModule('/functions/api/resources/index.ts')
const resourceEdit = await server.ssrLoadModule('/functions/api/resources/resources/[id]/index.ts')
const accounts = await server.ssrLoadModule('/functions/api/resources/accounts/index.ts')
const dashboard = await server.ssrLoadModule('/functions/api/dashboard/summary/index.ts')
const domains = await server.ssrLoadModule('/functions/api/domains/index.ts')
const batch = await server.ssrLoadModule('/functions/api/domains/batch/index.ts')
const imports = await server.ssrLoadModule('/functions/api/domains/import.ts')
const { issueSessionToken } = await server.ssrLoadModule('/functions/utils/auth.ts')
const token = await issueSessionToken('test', 'test-secret')
const store = database()
const env = { DB: store.db, USER: 'test', PASS: 'test-secret', API_TOKEN: 'sync-test' }
const ctx = (url, body, method = 'POST') => ({ env, params: { id: '1' }, request: new Request('https://example.test' + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) })
const website = domain => ({ domain, registrar: 'test', registrar_date: '2026-01-01', expiry_date: '2027-01-01', service_type: '正常网站', status: '在线', platform: 'Astro' })
const createDomain = async domain => { const response = await domains.onRequestPost(ctx('/api/domains', website(domain))); assert.equal(response.status, 200, await response.text()) }
const createAccount = async (name, status = '正常') => { store.sql('INSERT INTO provider_accounts (provider, name, status) VALUES (?, ?, ?)', ['github', name, status]); return store.sql('SELECT id FROM provider_accounts WHERE name=?', [name])[0].id }
const createResource = async (accountId, name, status = '正常', identifier = null) => { store.sql('INSERT INTO provider_resources (account_id, provider, name, identifier, status) VALUES (?, ?, ?, ?, ?)', [accountId, 'github', name, identifier, status]); return store.sql('SELECT id FROM provider_resources WHERE name=?', [name])[0].id }
const link = async body => links.onRequestPost(ctx('/api/resources/links', body))

beforeEach(() => store.init())
after(async () => { store.close(); await server.close() })

test('invalid website does not leave an auto-generated account resource', async () => {
  const accountId = await createAccount('invalid-link-account')
  const response = await link({ domain_id: 999, account_id: accountId, role: '账号归属', is_primary: true })
  assert.equal(response.status, 400)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM provider_resources WHERE account_id=?', [accountId])[0].count, 0)
})

test('single and batch bindings keep at most one primary resource per website', async () => {
  await createDomain('primary.test')
  const account = await createAccount('primary-account')
  const first = await createResource(account, 'repo-one')
  const second = await createResource(account, 'repo-two')
  assert.equal((await link({ domain_id: 1, resource_id: first, role: '代码仓库', is_primary: true })).status, 201)
  assert.equal((await link({ domain_id: 1, resource_id: second, role: '部署平台', is_primary: true })).status, 201)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM domain_resources WHERE domain_id=1 AND is_primary=1')[0].count, 1)
  const response = await batch.onRequestPost(ctx('/api/domains/batch', { operations: [{ type: 'resource_link_add', domain_id: 1, resource_id: first, role: '代码仓库', is_primary: 1 }] }))
  assert.equal(response.status, 200, await response.text())
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM domain_resources WHERE domain_id=1 AND is_primary=1')[0].count, 1)
})

test('disabled accounts and resources reject new bindings while existing links remain', async () => {
  await createDomain('disabled.test')
  const account = await createAccount('disabled-account', '停用')
  const resource = await createResource(account, 'disabled-resource', '停用')
  const accountResponse = await link({ domain_id: 1, account_id: account, role: '账号归属' })
  const resourceResponse = await link({ domain_id: 1, resource_id: resource, role: '代码仓库' })
  assert.equal(accountResponse.status, 400)
  assert.equal(resourceResponse.status, 400)
  store.sql('INSERT INTO domain_resources (domain_id, resource_id, role) VALUES (1, ?, ?)', [resource, '历史关联'])
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM domain_resources WHERE domain_id=1')[0].count, 1)
})

test('import restores the primary marker from a backup resource entry', async () => {
  await createDomain('restore.test')
  const account = await createAccount('restore-account')
  const resource = await createResource(account, 'restore-repo')
  const response = await imports.onRequestPost(ctx('/api/domains/import', [{ ...website('restore.test'), resources: [{ provider: 'github', account: 'restore-account', resource: 'restore-repo', role: '代码仓库', is_primary: 1 }] }]))
  assert.equal(response.status, 200, await response.text())
  assert.equal(store.sql('SELECT is_primary FROM domain_resources WHERE domain_id=1 AND resource_id=?', [resource])[0].is_primary, 1)
})

test('account ownership resources remain system-managed', async () => {
  const account = await createAccount('managed-account')
  const autoResource = await createResource(account, 'managed-account（账号归属）', '正常', `account:${account}`)
  const response = await resourceEdit.onRequestPut(ctx('/api/resources/resources/1', { name: 'renamed', account_id: account, provider: 'github', identifier: 'repo:renamed', status: '正常' }, 'PUT'))
  assert.equal(response.status, 400)
  assert.equal(store.sql('SELECT name, identifier FROM provider_resources WHERE id=?', [autoResource])[0].identifier, `account:${account}`)
})

test('resource counts exclude account ownership resources while account links remain counted', async () => {
  await createDomain('count.test')
  const account = await createAccount('count-account')
  const autoResource = await createResource(account, 'count-account（账号归属）', '正常', `account:${account}`)
  const concrete = await createResource(account, 'count-repo')
  store.sql('INSERT INTO domain_resources (domain_id, resource_id, role, is_primary) VALUES (1, ?, ?, 1), (1, ?, ?, 0)', [autoResource, '账号归属', concrete, '代码仓库'])
  const accountResponse = await accounts.onRequestGet(ctx('/api/resources/accounts', undefined, 'GET'))
  assert.equal(accountResponse.status, 200)
  assert.equal((await accountResponse.json()).data[0].resource_count, 1)
  const dashboardResponse = await dashboard.onRequestGet(ctx('/api/dashboard/summary', undefined, 'GET'))
  assert.equal(dashboardResponse.status, 200)
  const provider = (await dashboardResponse.json()).data.providers.find(item => item.provider === 'github')
  assert.equal(provider.resource_count, 1)
  assert.equal(provider.linked_domain_count, 1)
})
