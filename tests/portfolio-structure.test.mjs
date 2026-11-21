import assert from 'node:assert/strict'
import { test, after, beforeEach } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom'
})
const sites = await server.ssrLoadModule('/functions/api/websites/index.ts')
const edit = await server.ssrLoadModule('/functions/api/websites/[id].ts')
const links = await server.ssrLoadModule('/functions/api/resources/links/index.ts')
const store = database()
let session
const ctx = (body, method = 'GET', id = '1') => ({
  env: { DB: store.db, USER: 'test', PASS: 'secret', CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(32) },
  params: { id },
  request: new Request('https://manager.test/api', {
    method,
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
})
const call = async (handler, context, status = 200) => {
  const response = await handler(context)
  const body = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body.data
}
beforeEach(async () => {
  store.init()
  session = await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test', 'secret')
})
after(async () => {
  store.close()
  await server.close()
})
const create = () =>
  call(
    sites.onRequestPost,
    ctx(
      {
        name: 'Example',
        platform: 'Astro',
        domain: {
          domain: 'example.com',
          registrar: 'r',
          registrar_date: '2026-01-01',
          expiry_date: '2027-01-01',
          service_type: '网站'
        }
      },
      'POST'
    ),
    201
  )
test('generic counts survive stack and domain changes, legacy writes share the same values', async () => {
  await create()
  await call(
    edit.onRequestPatch,
    ctx(
      {
        calculator_count: 0,
        article_count: 12,
        page_count: 20,
        computer_name: 'Mac Mini YC',
        content_stats_updated_date: '2026-11-21'
      },
      'PATCH'
    )
  )
  await call(edit.onRequestPatch, ctx({ platform: 'Next.js' }, 'PATCH'))
  await call(edit.onRequestPatch, ctx({ article_count: 14, content_stats_updated_date: '2026-11-21' }, 'PATCH'))
  const [site] = await call(sites.onRequestGet, ctx())
  assert.equal(site.calculator_count, 0)
  assert.equal(site.article_count, 14)
  assert.equal(site.computer_name, 'Mac Mini YC')
  await call(edit.onRequestPatch, ctx({ article_count: 15, wp_article_count: 16 }, 'PATCH'), 400)
  assert.equal(store.sql('SELECT article_count FROM websites')[0].article_count, 14)
})
test('hosting and repository can both be primary and DNS does not become hosting', async () => {
  await create()
  store.sql(`INSERT INTO provider_accounts(provider,name,provider_name) VALUES('github','main','GitHub'),('vhost','hosting','SiteGround'),('cloudflare','dns','Cloudflare');
 INSERT INTO provider_resources(account_id,provider,name,resource_url,ip_address) VALUES(1,'github','repo','https://github.com/org/repo',NULL),(2,'vhost','host',NULL,'203.0.113.10'),(3,'cloudflare','zone',NULL,NULL);`)
  for (const [resource_id, role] of [
    [1, '代码仓库'],
    [2, '托管'],
    [3, 'DNS/CDN']
  ])
    await call(links.onRequestPost, ctx({ website_id: 1, resource_id, role, is_primary: true }, 'POST'), 201)
  const [site] = await call(sites.onRequestGet, ctx())
  assert.equal(site.hosting.provider_name, 'SiteGround')
  assert.equal(site.hosting.ip_address, '203.0.113.10')
  assert.equal(site.repository.resource_url, 'https://github.com/org/repo')
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_resources WHERE is_primary=1')[0].n, 3)
})
test('copy uses account defaults and refuses missing credentials', async () => {
  await create()
  const copy = await server.ssrLoadModule('/functions/api/websites/[id]/copy/index.ts')
  store.sql(
    `INSERT INTO provider_accounts(provider,name,login_email) VALUES('github','main','user@example.com'); INSERT INTO provider_resources(account_id,provider,name,resource_url) VALUES(1,'github','repo','https://github.com/org/repo'); INSERT INTO website_resources(website_id,resource_id,role,is_primary) VALUES(1,1,'代码仓库',1);`
  )
  await call(copy.onRequestPost, ctx({}, 'POST'), 400)
  const credentials = await server.ssrLoadModule('/functions/api/resources/credentials/index.ts')
  await call(
    credentials.onRequestPost,
    ctx({ account_id: 1, label: 'main', token: 'test-secret', is_default: true }, 'POST'),
    201
  )
  const result = await call(copy.onRequestPost, ctx({}, 'POST'))
  assert.equal(
    result.text,
    '域名：example.com\n\nGithub地址：https://github.com/org/repo\nGithub Email：user@example.com\nGithub Token：test-secret'
  )
  const [site] = await call(sites.onRequestGet, ctx())
  assert.ok(!JSON.stringify(site).includes('test-secret'))
  store.sql("UPDATE provider_accounts SET login_email='changed@example.com' WHERE id=1")
  assert.ok((await call(copy.onRequestPost, ctx({}, 'POST'))).text.includes('changed@example.com'))
})
test('changing primary resources preserves relation notes and invalid roles cannot masquerade as hosting', async () => {
  await create()
  store.sql(
    `INSERT INTO provider_accounts(provider,name) VALUES('github','main'); INSERT INTO provider_resources(account_id,provider,name) VALUES(1,'github','repo'); INSERT INTO website_resources(website_id,resource_id,role,is_primary,memo) VALUES(1,1,'代码仓库',0,'keep my note');`
  )
  await call(
    links.onRequestPost,
    ctx({ website_id: 1, resource_id: 1, role: '代码仓库', is_primary: true }, 'POST'),
    201
  )
  assert.equal(store.sql('SELECT memo FROM website_resources')[0].memo, 'keep my note')
  await call(links.onRequestPost, ctx({ website_id: 1, resource_id: 1, role: '托管', is_primary: true }, 'POST'), 400)
})
test('backup roundtrip preserves distinct resource purposes and new account fields', async () => {
  await create()
  store.sql(
    `INSERT INTO provider_accounts(provider,name,provider_name,github_username) VALUES('github','main','GitHub','user'); INSERT INTO provider_resources(account_id,provider,name) VALUES(1,'github','repo'); INSERT INTO website_resources(website_id,resource_id,role,memo) VALUES(1,1,'代码仓库','canonical note'),(1,1,'其他','legacy note');`
  )
  const exports = await server.ssrLoadModule('/functions/api/backups/index.ts')
  const imports = await server.ssrLoadModule('/functions/api/backups/index.ts')
  const backup = await call(exports.onRequestGet, ctx())
  await call(imports.onRequestPost, ctx(backup, 'POST'))
  assert.deepEqual(store.sql('SELECT role,memo FROM website_resources ORDER BY id'), [
    { role: '代码仓库', memo: 'canonical note' },
    { role: '其他', memo: 'legacy note' }
  ])
})
test('legacy review comparison ignores retired scenarios and maps old count totals', async () => {
  const { snapshotMatches } = await server.ssrLoadModule('/functions/domain/batches.ts')
  const old = {
    member_count: 1,
    scenario_counts: '{"WordPress 计算器站":1}',
    stage_counts: '{"验证":1}',
    content_totals: '{"page_count":20,"article_count":8,"calculator_count":3}'
  }
  assert.equal(snapshotMatches(old, [{ stage: '验证', page_count: 20, article_count: 8, calculator_count: 3 }]), true)
  assert.equal(snapshotMatches(old, [{ stage: '验证', page_count: 20, article_count: 9, calculator_count: 3 }]), false)
})
