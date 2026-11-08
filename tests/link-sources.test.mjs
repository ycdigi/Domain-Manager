import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migration = fs.readFileSync(path.join(root, 'schema-migration-v1.17.0.sql'), 'utf8')
const migration118 = fs.readFileSync(path.join(root, 'schema-migration-v1.18.0.sql'), 'utf8')
const migration119 = fs.readFileSync(path.join(root, 'schema-migration-v1.19.0.sql'), 'utf8')
const migration1191 = fs.readFileSync(path.join(root, 'schema-migration-v1.19.1.sql'), 'utf8')
const migration120 = fs.readFileSync(path.join(root, 'schema-migration-v1.20.0.sql'), 'utf8')
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const sources = await server.ssrLoadModule('/functions/api/link-sources/index.ts')
const sourceEdit = await server.ssrLoadModule('/functions/api/link-sources/[id]/index.ts')
const sourceImport = await server.ssrLoadModule('/functions/api/link-sources/import/index.ts')
const sourceReview = await server.ssrLoadModule('/functions/api/link-sources/review/index.ts')
const opportunities = await server.ssrLoadModule('/functions/api/websites/[id]/link-opportunities/index.ts')
const opportunityEdit = await server.ssrLoadModule('/functions/api/websites/[id]/link-opportunities/[opportunity_id]/index.ts')
const opportunityAttempts = await server.ssrLoadModule('/functions/api/websites/[id]/link-opportunities/[opportunity_id]/attempts/index.ts')
const snapshotApi = await server.ssrLoadModule('/functions/api/export/snapshot/index.ts')
const importData = await server.ssrLoadModule('/functions/api/domains/import.ts')
const auth = await server.ssrLoadModule('/functions/utils/auth.ts')
const shared = await server.ssrLoadModule('/shared/link-sources.ts')
const store = database()
let session
const context = (url, body, method = 'GET', id = '1', opportunityId = '1', authorization = session) => ({
  env: { DB: store.db, USER: 'test', PASS: 'secret' },
  params: { id, opportunity_id: opportunityId },
  request: new Request(`https://example.test${url}`, { method, headers: { ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
})
const call = async (handler, ctx, status = 200) => { const response = await handler(ctx); const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body.data }
beforeEach(async () => { store.init(); store.script(`PRAGMA foreign_keys=ON;\n${migration}\n${migration118}\n${migration120}`); session = await auth.issueSessionToken('test', 'secret') })
after(async () => { store.close(); await server.close() })

test('v1.17 migration is repeatable and creates the link tables', () => {
  store.script(migration)
  store.script(migration118)
  store.script(migration118)
  const tables = store.sql("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('link_sources','website_link_opportunities','link_attempts') ORDER BY name;")
  assert.deepEqual(tables.map(row => row.name), ['link_attempts', 'link_sources', 'website_link_opportunities'])
  assert.equal(store.sql("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name='uq_link_sources_source_template';")[0].count, 1)
})

test('v1.20 migration is repeatable and keeps review state separate from source approval', () => {
  store.script(migration120)
  store.script(migration120)
  assert.deepEqual(store.sql("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('link_source_reviews','link_source_review_runs') ORDER BY name;"), [
    { name: 'link_source_review_runs' },
    { name: 'link_source_reviews' }
  ])
  store.sql("INSERT INTO link_sources(name,source_url) VALUES ('Source','https://source.example');")
  assert.deepEqual(store.sql("SELECT funnel_stage,check_status FROM link_source_reviews WHERE source_id=1;"), [])
})

test('review results classify sources for the funnel without approving or enabling them', async () => {
  store.sql("INSERT INTO link_sources(name,source_url) VALUES ('Source','https://source.example'),('Broken','https://broken.example');")
  const result = await call(sourceReview.onRequestPost, context('/api/link-sources/review', {
    run: { planned_count: 2, completed_count: 2, failed_count: 0, status: '已完成' },
    results: [
      { source_id: 1, check_status: '可访问', http_status: 200, checked_url: 'https://source.example' },
      { source_id: 2, check_status: '404', http_status: 404, checked_url: 'https://broken.example', error_message: '页面不存在' }
    ]
  }, 'POST'))
  assert.equal(result.updated, 2)
  assert.deepEqual(store.sql('SELECT source_id,funnel_stage,check_status,http_status FROM link_source_reviews ORDER BY source_id;'), [
    { source_id: 1, funnel_stage: '建议保留', check_status: '可访问', http_status: 200 },
    { source_id: 2, funnel_stage: '待删除', check_status: '404', http_status: 404 }
  ])
  assert.deepEqual(store.sql('SELECT approval_status,enabled FROM link_sources ORDER BY id;'), [
    { approval_status: '待审核', enabled: 0 },
    { approval_status: '待审核', enabled: 0 }
  ])
  assert.deepEqual(store.sql('SELECT planned_count,completed_count,failed_count,status FROM link_source_review_runs;'), [
    { planned_count: 2, completed_count: 2, failed_count: 0, status: '已完成' }
  ])
})

test('v1.19 migration preserves attempts and converts direct historical outcomes', () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO link_sources(name,source_url,approval_status,enabled) VALUES ('Source','https://source.example','已批准',1); INSERT INTO website_link_opportunities(website_id,source_id,target_url,status) VALUES (1,1,'https://site.example','被拒绝');")
  store.sql('DROP INDEX idx_link_attempts_opportunity; DROP TABLE link_attempts; CREATE TABLE link_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL, attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP, method TEXT NOT NULL CHECK(method IN (\'人工\',\'自动\')), request_status TEXT NOT NULL CHECK(request_status IN (\'已完成\',\'失败\',\'需要人工\')), http_status INTEGER, confirmed_public_link INTEGER NOT NULL DEFAULT 0 CHECK(confirmed_public_link IN (0,1)), error_message TEXT, response_summary TEXT, evidence_url TEXT, FOREIGN KEY(opportunity_id) REFERENCES website_link_opportunities(id) ON DELETE CASCADE); CREATE INDEX idx_link_attempts_opportunity ON link_attempts(opportunity_id, attempted_at DESC); INSERT INTO link_attempts(opportunity_id,method,request_status,response_summary) VALUES (1,\'人工\',\'需要人工\',\'保留旧记录\');')
  store.script(migration119)
  assert.deepEqual(store.sql('SELECT request_status,result_status,response_summary FROM link_attempts ORDER BY id;'), [
    { request_status: '需要人工', result_status: null, response_summary: '保留旧记录' },
    { request_status: '已完成', result_status: '被拒绝', response_summary: 'v1.19.0 迁移补记历史候选状态：被拒绝' }
  ])
  assert.throws(() => store.sql("INSERT INTO link_attempts(opportunity_id,method,request_status,result_status) VALUES (1,'自动','已完成','被拒绝');"))
  store.script(migration1191)
  store.script(migration1191)
  assert.throws(() => store.sql("INSERT INTO link_attempts(opportunity_id,method,request_status,result_status,confirmed_public_link,evidence_url) VALUES (1,'人工','已完成','被拒绝',1,'https://source.example/page');"))
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM link_attempts;')[0].count, 2)
})

test('sources default to pending observation and approved sources become enabled', async () => {
  const pending = await call(sources.onRequestPost, context('/api/link-sources', { name: 'Example directory', source_url: 'example.com', url_template: 'https://example.com/submit?url=***' }, 'POST'), 201)
  assert.equal(pending.source_url, 'https://example.com')
  assert.equal(pending.url_template, 'https://example.com/submit?url={{target_url}}')
  assert.equal(pending.approval_status, '待审核')
  assert.equal(pending.submission_mode, '仅观察')
  assert.equal(pending.enabled, 0)
  const approved = await call(sourceEdit.onRequestPatch, context('/api/link-sources/1', { approval_status: '已批准' }, 'PATCH'), 200)
  assert.equal(approved.enabled, 1)
  const disabled = await call(sourceEdit.onRequestPatch, context('/api/link-sources/1', { enabled: 0 }, 'PATCH'), 200)
  assert.equal(disabled.enabled, 0)
  const edited = await call(sourceEdit.onRequestPatch, context('/api/link-sources/1', { memo: '保留停用状态' }, 'PATCH'), 200)
  assert.equal(edited.enabled, 0)
})

test('source validation rejects unsafe templates and keeps duplicate sources unique', async () => {
  await call(sources.onRequestPost, context('/api/link-sources', { name: 'Unsafe', source_url: 'https://example.com', url_template: 'https://{{target_url}}.example.com/' }, 'POST'), 400)
  await call(sources.onRequestPost, context('/api/link-sources', { name: 'Safe', source_url: 'https://example.com', url_template: 'https://example.com/?q={{target_url}}' }, 'POST'), 201)
  await call(sources.onRequestPost, context('/api/link-sources', { name: 'Duplicate', source_url: 'https://example.com/', url_template: 'https://example.com/?q={{target_url}}' }, 'POST'), 409)
  await call(sources.onRequestPost, context('/api/link-sources', { name: 'No template', source_url: 'https://no-template.example' }, 'POST'), 201)
  await call(sources.onRequestPost, context('/api/link-sources', { name: 'Duplicate without template', source_url: 'https://no-template.example/' }, 'POST'), 409)
})

test('submission address generation encodes target URLs and never permits non-HTTP schemes', () => {
  const generated = shared.generateSubmissionUrl('https://directory.example/search?url={{target_url}}', 'site.example/path?a=1&b=two words')
  assert.equal(new URL(generated).searchParams.get('url'), 'https://site.example/path?a=1&b=two%20words')
  assert.equal(shared.generateSubmissionUrl('javascript:alert({{target_url}})', 'site.example'), null)
  assert.equal(shared.generateSubmissionUrl('https://{{target_url}}.example/', 'site.example'), null)
})

test('pausing or disabling an approved source removes its queued candidates from processing', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site');")
  await call(sources.onRequestPost, context('/api/link-sources', { name: 'Ready', source_url: 'https://ready.example', approval_status: '已批准' }, 'POST'), 201)
  await call(opportunities.onRequestPost, context('/api/websites/1/link-opportunities', { source_id: 1, target_url: 'site.example' }, 'POST'), 201)
  await call(sourceEdit.onRequestPatch, context('/api/link-sources/1', { approval_status: '已暂停' }, 'PATCH'))
  assert.equal(store.sql('SELECT status FROM website_link_opportunities WHERE id=1;')[0].status, '已暂停')
  await call(sourceEdit.onRequestPatch, context('/api/link-sources/1', { approval_status: '已批准' }, 'PATCH'))
  await call(opportunityEdit.onRequestPatch, context('/api/websites/1/link-opportunities/1', { status: '待处理' }, 'PATCH'))
  await call(sourceEdit.onRequestPatch, context('/api/link-sources/1', { enabled: 0 }, 'PATCH'))
  assert.equal(store.sql('SELECT status FROM website_link_opportunities WHERE id=1;')[0].status, '已暂停')
})

test('opportunities require an approved enabled source before entering the queue and deduplicate targets', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site');")
  await call(sources.onRequestPost, context('/api/link-sources', { name: 'Pending', source_url: 'https://directory.example', url_template: 'https://directory.example/?url={{target_url}}' }, 'POST'), 201)
  const pending = await call(opportunities.onRequestPost, context('/api/websites/1/link-opportunities', { source_id: 1, target_url: 'example.com' }, 'POST'), 201)
  assert.equal(pending.target_url, 'https://example.com')
  assert.equal(pending.status, '待审核')
  await call(opportunityEdit.onRequestPatch, context('/api/websites/1/link-opportunities/1', { status: '待处理' }, 'PATCH'), 400)
  await call(sourceEdit.onRequestPatch, context('/api/link-sources/1', { approval_status: '已批准' }, 'PATCH'), 200)
  const queued = await call(opportunityEdit.onRequestPatch, context('/api/websites/1/link-opportunities/1', { status: '待处理' }, 'PATCH'), 200)
  assert.equal(queued.status, '待处理')
  await call(opportunities.onRequestPost, context('/api/websites/1/link-opportunities', { source_id: 1, target_url: 'https://example.com/' }, 'POST'), 409)
})

test('unapproved sources cannot generate submission addresses or enter the processing workflow', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO link_sources(name,source_url,url_template) VALUES ('Pending','https://directory.example','https://directory.example/?url={{target_url}}');")
  await call(opportunities.onRequestPost, context('/api/websites/1/link-opportunities', {
    source_id: 1, target_url: 'site.example', status: '已生成提交地址', submission_url: 'https://directory.example/?url=https%3A%2F%2Fsite.example'
  }, 'POST'), 400)
  const candidate = await call(opportunities.onRequestPost, context('/api/websites/1/link-opportunities', { source_id: 1, target_url: 'site.example' }, 'POST'), 201)
  assert.equal(candidate.status, '待审核')
  await call(opportunityEdit.onRequestPatch, context('/api/websites/1/link-opportunities/1', { status: '已生成提交地址' }, 'PATCH'), 400)
  await call(opportunityEdit.onRequestPatch, context('/api/websites/1/link-opportunities/1', { status: '请求已完成' }, 'PATCH'), 400)
})

test('attempt-derived statuses and automatic attempts cannot bypass manual evidence flow', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO link_sources(name,source_url,approval_status,enabled) VALUES ('Source','https://source.example','已批准',1); INSERT INTO website_link_opportunities(website_id,source_id,target_url,status) VALUES (1,1,'https://site.example','待处理');")
  for (const status of ['请求已完成', '请求失败', '需要人工处理', '已提交待审核']) await call(opportunityEdit.onRequestPatch, context('/api/websites/1/link-opportunities/1', { status }, 'PATCH'), 400)
  await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '人工', request_status: '失败', result_status: '被拒绝'
  }, 'POST'), 400)
  await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '自动', request_status: '已完成'
  }, 'POST'), 400)
  for (const result_status of ['已提交待审核', '被拒绝', '来源失效']) {
    await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
      method: '人工', request_status: '已完成', result_status
    }, 'POST'), 201)
  }
  assert.deepEqual(store.sql('SELECT result_status FROM link_attempts ORDER BY id;').map(row => row.result_status), ['已提交待审核', '被拒绝', '来源失效'])
})

test('a source-invalid attempt disables the source and pauses other queued candidates', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site one'),('Site two'),('Site three'); INSERT INTO link_sources(name,source_url,approval_status,enabled) VALUES ('Source','https://source.example','已批准',1); INSERT INTO website_link_opportunities(website_id,source_id,target_url,status) VALUES (1,1,'https://one.example','待处理'),(2,1,'https://two.example','已生成提交地址'),(3,1,'https://three.example','待处理');")
  await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '人工', request_status: '已完成', result_status: '来源失效', response_summary: '来源页面已下线'
  }, 'POST'), 201)
  assert.deepEqual(store.sql('SELECT approval_status,enabled FROM link_sources;'), [{ approval_status: '已失效', enabled: 0 }])
  assert.deepEqual(store.sql('SELECT status FROM website_link_opportunities ORDER BY id;').map(row => row.status), ['来源失效', '已暂停', '已暂停'])
})

test('a public-link conclusion requires an approved and enabled source at attempt time', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO link_sources(name,source_url) VALUES ('Pending','https://pending.example'); INSERT INTO website_link_opportunities(website_id,source_id,target_url,status) VALUES (1,1,'https://site.example','待审核');")
  await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '人工', request_status: '已完成', confirmed_public_link: 1, evidence_url: 'https://pending.example/page'
  }, 'POST'), 400)
})

test('public-link conclusions can only be written by an evidenced attempt', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO link_sources(name,source_url,approval_status,enabled) VALUES ('Source','https://source.example','已批准',1);")
  await call(opportunities.onRequestPost, context('/api/websites/1/link-opportunities', { source_id: 1, target_url: 'site.example', status: '已确认公开链接' }, 'POST'), 400)
  await call(opportunities.onRequestPost, context('/api/websites/1/link-opportunities', { source_id: 1, target_url: 'site.example' }, 'POST'), 201)
  await call(opportunityEdit.onRequestPatch, context('/api/websites/1/link-opportunities/1', { status: '已确认公开链接' }, 'PATCH'), 400)
})

test('source import stays offline and imports audited rows as pending observation', async () => {
  const result = await call(sourceImport.onRequestPost, context('/api/link-sources/import', { rows: [
    { source_url: 'https://one.example', url_template: 'https://one.example/?url={{target_url}}', source_type: '工具目录', audit_flags: ['海外候选'] },
    { source_url: 'https://bad.example', url_template: 'https://{{target_url}}.example', source_type: '工具目录' }
  ] }, 'POST'))
  assert.equal(result.created, 1)
  assert.equal(result.skipped.length, 1)
  assert.deepEqual(store.sql('SELECT approval_status, submission_mode, enabled FROM link_sources;'), [{ approval_status: '待审核', submission_mode: '仅观察', enabled: 0 }])
})

test('website deletion cascades opportunities and attempts', () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES (1,'site.example','r','2026-01-01','2027-01-01','网站'); INSERT INTO link_sources(name,source_url) VALUES ('Source','https://source.example'); INSERT INTO website_link_opportunities(website_id,source_id,target_url) VALUES (1,1,'https://site.example'); INSERT INTO link_attempts(opportunity_id,method,request_status) VALUES (1,'人工','需要人工');")
  store.sql('DELETE FROM websites WHERE id=1;')
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_link_opportunities;')[0].count, 0)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM link_attempts;')[0].count, 0)
})

test('link source data is included in snapshot export and can be restored', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES (1,'site.example','r','2026-01-01','2027-01-01','网站'); INSERT INTO link_sources(name,source_url) VALUES ('Source','https://source.example'); INSERT INTO link_source_reviews(source_id,funnel_stage,check_status,http_status) VALUES (1,'建议保留','可访问',200); INSERT INTO link_source_review_runs(id,planned_count,completed_count,status) VALUES (1,1,1,'已完成'); INSERT INTO website_link_opportunities(website_id,source_id,target_url,status) VALUES (1,1,'https://site.example','被拒绝'); INSERT INTO link_attempts(opportunity_id,method,request_status,result_status,response_summary) VALUES (1,'人工','已完成','被拒绝','目录拒绝');")
  const snapshot = await call(snapshotApi.onRequestGet, context('/api/export/snapshot'))
  assert.equal(snapshot.link_sources.length, 1)
  assert.equal(snapshot.link_source_reviews.length, 1)
  assert.equal(snapshot.link_source_review_runs.length, 1)
  assert.equal(snapshot.website_link_opportunities.length, 1)
  assert.equal(snapshot.link_attempts.length, 1)
  store.sql('DELETE FROM websites; DELETE FROM link_sources;')
  await call(importData.onRequestPost, context('/api/domains/import', snapshot, 'POST'))
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM link_sources;')[0].count, 1)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM link_source_reviews;')[0].count, 1)
  assert.equal(store.sql('SELECT status FROM link_source_review_runs WHERE id=1;')[0].status, '已完成')
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_link_opportunities;')[0].count, 1)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM link_attempts;')[0].count, 1)
  assert.deepEqual(store.sql('SELECT request_status,result_status,response_summary FROM link_attempts;'), [{ request_status: '已完成', result_status: '被拒绝', response_summary: '目录拒绝' }])
})

test('snapshot import rejects result states that have no matching attempt history', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES (1,'site.example','r','2026-01-01','2027-01-01','网站'); INSERT INTO link_sources(name,source_url) VALUES ('Source','https://source.example'); INSERT INTO website_link_opportunities(website_id,source_id,target_url,status) VALUES (1,1,'https://site.example','被拒绝');")
  const snapshot = await call(snapshotApi.onRequestGet, context('/api/export/snapshot'))
  store.sql('DELETE FROM websites; DELETE FROM link_sources;')
  await call(importData.onRequestPost, context('/api/domains/import', snapshot, 'POST'), 400)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM websites;')[0].count, 0)
})

test('audit script classifies, cleans and reports duplicate templates without network access', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-audit-')); const input = path.join(dir, 'links.txt'); const output = path.join(dir, 'audit.json')
  try {
    fs.writeFileSync(input, 'https://directory.example/submit?url=***,\nhttps://directory.example/submit?url=***\nhttps://{{target_url}}.example/\n')
    execFileSync('node', ['scripts/audit-link-sources.mjs', '--input', input, '--output', output], { cwd: root, encoding: 'utf8' })
    const result = JSON.parse(fs.readFileSync(output, 'utf8'))
    assert.equal(result.total, 3)
    assert.equal(result.valid, 2)
    assert.equal(result.duplicates, 1)
    assert.equal(result.rows[0].url_template, 'https://directory.example/submit?url={{target_url}}')
    assert.ok(result.rows[0].audit_flags.includes('包含尾部标点'))
    assert.ok(result.rows[2].audit_flags.includes('占位符位于主机名'))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('link APIs require the normal session token', async () => {
  await call(sources.onRequestGet, context('/api/link-sources', undefined, 'GET', '1', '1', ''), 401)
})

test('source listing and review results accept the configured API token for the Mac Mini worker', async () => {
  const apiContext = (handlerContext, url, body, method = 'GET') => ({ ...handlerContext(url, body, method, '1', '1', ''), request: new Request(`https://example.test${url}`, { method, headers: { Authorization: 'Bearer worker-token', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env: { ...store.db, DB: store.db, USER: 'test', PASS: 'secret', API_TOKEN: 'worker-token' } })
  const sourceResult = await sources.onRequestGet(apiContext(context, '/api/link-sources'))
  assert.equal(sourceResult.status, 200)
  const reviewResult = await sourceReview.onRequestPost(apiContext(context, '/api/link-sources/review', { run: { planned_count: 0, completed_count: 0, failed_count: 0, status: '已完成' }, results: [] }, 'POST'))
  assert.equal(reviewResult.status, 200)
})

test('manual attempts persist evidence and update the candidate status without requesting a third party', async () => {
  store.sql("INSERT INTO websites(name) VALUES ('Site'); INSERT INTO link_sources(name,source_url,approval_status,enabled) VALUES ('Source','https://source.example','已批准',1); INSERT INTO website_link_opportunities(website_id,source_id,target_url,status) VALUES (1,1,'https://site.example','待处理');")
  await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '人工', request_status: '失败', confirmed_public_link: 1
  }, 'POST'), 400)
  await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '人工', request_status: '已完成', confirmed_public_link: 1
  }, 'POST'), 400)
  const attempt = await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '人工', request_status: '已完成', http_status: 200, confirmed_public_link: 1,
    response_summary: '人工确认页面包含目标链接', evidence_url: 'https://source.example/page'
  }, 'POST'), 201)
  assert.equal(attempt.confirmed_public_link, 1)
  assert.equal(store.sql('SELECT status, evidence_url, last_attempt_at FROM website_link_opportunities WHERE id=1;')[0].status, '已确认公开链接')
  assert.equal((await call(opportunityAttempts.onRequestGet, context('/api/websites/1/link-opportunities/1/attempts'))).length, 1)
  await call(opportunityAttempts.onRequestPost, context('/api/websites/1/link-opportunities/1/attempts', {
    method: '人工', request_status: '失败', confirmed_public_link: 0, error_message: '页面拒绝提交'
  }, 'POST'), 201)
  assert.equal(store.sql('SELECT status FROM website_link_opportunities WHERE id=1;')[0].status, '请求失败')
  assert.equal(store.sql('SELECT evidence_url FROM website_link_opportunities WHERE id=1;')[0].evidence_url, null)
})
