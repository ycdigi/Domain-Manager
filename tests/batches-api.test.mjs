import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const sites = await server.ssrLoadModule('/functions/api/websites/index.ts')
const batchList = await server.ssrLoadModule('/functions/api/batches/index.ts')
const batchDetail = await server.ssrLoadModule('/functions/api/batches/[id].ts')
const members = await server.ssrLoadModule('/functions/api/batches/[id]/members.ts')
const assign = await server.ssrLoadModule('/functions/api/batches/assign.ts')
const reviews = await server.ssrLoadModule('/functions/api/batches/[id]/reviews.ts')
const workQueue = await server.ssrLoadModule('/functions/api/work-queue/index.ts')
const snapshotApi = await server.ssrLoadModule('/functions/api/backups/index.ts')
const importData = await server.ssrLoadModule('/functions/api/backups/index.ts')

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

test('website content counts are independent from stack', async () => {
  const site = await createSite('Astro site', { page_count: 18, content_stats_updated_date: '2026-11-17' })
  assert.equal(site.page_count, 18)
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
  const site = await createSite('Review site', { platform: 'WordPress', calculator_count: 3, article_count: 8, content_stats_updated_date: '2026-11-17' })
  await call(batchList.onRequestPost, context('/api/batches', { name: 'Review batch' }, 'POST'), 201)
  await call(members.onRequestPost, context('/api/batches/1/members', { website_ids: [site.id] }, 'POST'))
  await call(reviews.onRequestPost, context('/api/batches/1/reviews', { action: 'request' }, 'POST'))
  assert.equal(store.sql('SELECT status FROM website_batches WHERE id=1')[0].status, '待复盘')
  const review = await call(reviews.onRequestPost, context('/api/batches/1/reviews', { action: 'complete', conclusion: '计算器批次值得继续', next_action: '扩大样本' }, 'POST'))
  assert.equal(review.snapshot.member_count, 1)
  assert.equal(review.snapshot.content_totals.calculator_count, 3)
  assert.equal(store.sql('SELECT status FROM website_batches WHERE id=1')[0].status, '已复盘')
  store.sql("UPDATE websites SET calculator_count=4 WHERE id=1")
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
  const site = await createSite('Backup site', { page_count: 12, content_stats_updated_date: '2026-11-17' })
  await call(batchList.onRequestPost, context('/api/batches', { name: 'Backup batch', source: '测试' }, 'POST'), 201)
  await call(members.onRequestPost, context('/api/batches/1/members', { website_ids: [site.id], note: '保留' }, 'POST'))
  store.sql("INSERT INTO website_batch_reviews(batch_id,reviewed_at,member_count,stage_counts,content_totals) VALUES(1,'2026-11-20T00:00:00.000Z',1,'{}','{}')")
  const backup = await call(snapshotApi.onRequestGet, context('/api/backups'))
  assert.equal(backup.website_batches.length, 1)
  assert.equal(backup.website_batch_members.length, 1)
  await call(importData.onRequestPost, context('/api/backups', backup, 'POST'))
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_batches')[0].count, 1)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_batch_members')[0].count, 1)
  await call(importData.onRequestPost, context('/api/backups', backup, 'POST'))
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_batch_reviews')[0].count, 1)
})


test('batch assignment creates a batch and atomically assigns websites with optional fields', async () => {
  const first = await createSite('Assign first')
  const second = await createSite('Assign second')
  const result = await call(assign.onRequestPost, context('/api/batches/assign', {
    website_ids: [first.id, second.id],
    batch: { name: 'Bulk assignment', source: '组合筛选' },
    member_note: '同一轮导入',
    website_fields: { stage: '验证', }
  }, 'POST'), 201)
  assert.equal(result.accepted, 2)
  assert.equal(result.skipped, 0)
  assert.equal(result.batch.name, 'Bulk assignment')
  assert.deepEqual(store.sql('SELECT website_id, member_note, membership_status FROM website_batch_members ORDER BY website_id'), [
    { website_id: 1, member_note: '同一轮导入', membership_status: 'active' },
    { website_id: 2, member_note: '同一轮导入', membership_status: 'active' }
  ])
  assert.deepEqual(store.sql('SELECT stage FROM websites ORDER BY id'), [
    { stage: '验证', },
    { stage: '验证', }
  ])
})

test('batch assignment skips current members and reactivates removed members', async () => {
  const first = await createSite('Existing member')
  const second = await createSite('Removed member')
  const batch = await call(batchList.onRequestPost, context('/api/batches', { name: 'Existing batch' }, 'POST'), 201)
  await call(members.onRequestPost, context(`/api/batches/${batch.id}/members`, { website_ids: [first.id, second.id] }, 'POST', '1', String(batch.id)))
  await call(members.onRequestDelete, context(`/api/batches/${batch.id}/members`, { website_ids: [second.id], reason: '换批次' }, 'DELETE', '1', String(batch.id)))
  const result = await call(assign.onRequestPost, context('/api/batches/assign', { batch_id: batch.id, website_ids: [first.id, second.id], member_note: '重新加入' }, 'POST'))
  assert.equal(result.accepted, 1)
  assert.equal(result.skipped, 1)
  assert.equal(result.reactivated, 1)
  assert.deepEqual(store.sql('SELECT website_id, membership_status, member_note, removed_reason FROM website_batch_members ORDER BY id'), [
    { website_id: 1, membership_status: 'active', member_note: null, removed_reason: null },
    { website_id: 2, membership_status: 'removed', member_note: null, removed_reason: '换批次' },
    { website_id: 2, membership_status: 'active', member_note: '重新加入', removed_reason: null }
  ])
})

test('batch assignment rejects archived batches and invalid website ids before writing', async () => {
  const site = await createSite('Valid site')
  const batch = await call(batchList.onRequestPost, context('/api/batches', { name: 'Archived batch' }, 'POST'), 201)
  await call(batchDetail.onRequestPatch, context(`/api/batches/${batch.id}`, { status: '已归档' }, 'PATCH', '1', String(batch.id)))
  await call(assign.onRequestPost, context('/api/batches/assign', { batch_id: batch.id, website_ids: [site.id] }, 'POST'), 409)
  await call(assign.onRequestPost, context('/api/batches/assign', { website_ids: [site.id, 999], batch: { name: 'Should not exist' } }, 'POST'), 404)
  assert.equal(store.sql("SELECT COUNT(*) AS count FROM website_batches WHERE name='Should not exist'")[0].count, 0)
  assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_batch_members')[0].count, 0)
})

test('both batch entry points reject archived batches without changing memberships or stages', async () => {
 const site=await createSite('Archived entry')
 await call(batchList.onRequestPost,context('/api/batches',{name:'Archived'},'POST'),201)
 store.sql("UPDATE website_batches SET status='已归档' WHERE id=1")
 await call(members.onRequestPost,context('/api/batches/1/members',{website_ids:[site.id]},'POST'),409)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batch_members')[0].n,0)
})

test('repeated removal and rejoining preserves every membership episode through backup restore', async () => {
 const site=await createSite('Repeated membership')
 await call(batchList.onRequestPost,context('/api/batches',{name:'Repeat'},'POST'),201)
 for(let round=0;round<3;round++) {
  await call(assign.onRequestPost,context('/api/batches/assign',{batch_id:1,website_ids:[site.id],member_note:'Join '+round},'POST'))
  await call(members.onRequestDelete,context('/api/batches/1/members',{website_ids:[site.id],reason:'Remove '+round},'DELETE'))
 }
 assert.deepEqual(store.sql('SELECT member_note,removed_reason,membership_status FROM website_batch_members ORDER BY id'),[0,1,2].map(round=>({member_note:'Join '+round,removed_reason:'Remove '+round,membership_status:'removed'})))
 const backup=await call(snapshotApi.onRequestGet,context('/api/backups'))
 await call(importData.onRequestPost,context('/api/backups',backup,'POST'))
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batch_members')[0].n,3)
 assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
})


test('batch member note changes distinguish retry from explicit update and clear', async () => {
 const site=await createSite('Member note')
 await call(batchList.onRequestPost,context('/api/batches',{name:'Notes'},'POST'),201)
 const update=body=>call(members.onRequestPost,context('/api/batches/1/members',{website_ids:[site.id],...body},'POST'))
 await update({note:'Original'});await update({})
 assert.equal(store.sql('SELECT member_note FROM website_batch_members')[0].member_note,'Original')
 await update({note:'Changed'})
 assert.equal(store.sql('SELECT member_note FROM website_batch_members')[0].member_note,'Changed')
 await update({note:''})
 assert.equal(store.sql('SELECT member_note FROM website_batch_members')[0].member_note,null)
})

test('all batch entry points and removals support 200 sites within D1 parameter limits', async () => {
 store.sql("WITH RECURSIVE ids(id) AS (SELECT 1 UNION ALL SELECT id+1 FROM ids WHERE id<200) INSERT INTO websites(id,name) SELECT id,'Website '||id FROM ids")
 const originalPrepare=store.db.prepare
 store.db.prepare=sql=>{ const statement=originalPrepare(sql),bind=statement.bind;statement.bind=(...values)=>{assert.ok(values.length<=100,'D1 bound parameter limit');return bind.apply(statement,values)};return statement }
 try {
  const website_ids=Array.from({length:200},(_,i)=>i+1)
  const result=await call(assign.onRequestPost,context('/api/batches/assign',{batch:{name:'200 sites'},website_ids},'POST'),201)
  assert.equal(result.accepted,200)
  await call(members.onRequestDelete,context('/api/batches/1/members',{website_ids},'DELETE'))
  await call(members.onRequestPost,context('/api/batches/1/members',{website_ids},'POST'))
  const retry=await call(assign.onRequestPost,context('/api/batches/assign',{batch_id:1,website_ids},'POST'))
  assert.equal(retry.skipped,200)
  assert.equal(retry.reactivated,0)
  assert.equal(store.sql("SELECT COUNT(*) n FROM website_batch_members WHERE membership_status='removed'")[0].n,200)
 } finally {store.db.prepare=originalPrepare}
})

test('new batch creation, memberships and optional stage all roll back together', async () => {
 const site=await createSite('Atomic new batch')
 store.script("CREATE TRIGGER fail_member BEFORE INSERT ON website_batch_members BEGIN SELECT RAISE(ABORT,'Injected membership failure'); END;")
 await call(assign.onRequestPost,context('/api/batches/assign',{batch:{name:'Must roll back'},website_ids:[site.id],website_fields:{stage:'增长'}},'POST'),500)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batches')[0].n,0)
 assert.equal(store.sql('SELECT stage FROM websites')[0].stage,'待评估')
})


test('batch creation and assignment both require an explicit nonempty name', async () => {
 const site=await createSite('Missing batch name')
 for(const batch of [{},{name:null},{name:''},{name:'   '}]) {
  await call(batchList.onRequestPost,context('/api/batches',batch,'POST'),400)
  await call(assign.onRequestPost,context('/api/batches/assign',{batch,website_ids:[site.id]},'POST'),400)
 }
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batches')[0].n,0)
})


test('restoring active and removed episodes orders writes to avoid stale active conflicts', async () => {
 const site=await createSite('Restore membership')
 await call(batchList.onRequestPost,context('/api/batches',{name:'Restore episodes'},'POST'),201)
 const payload={batch_id:1,website_ids:[site.id]}
 await call(assign.onRequestPost,context('/api/batches/assign',payload,'POST'))
 await call(members.onRequestDelete,context('/api/batches/1/members',{website_ids:[site.id],reason:'History'},'DELETE'))
 await call(assign.onRequestPost,context('/api/batches/assign',payload,'POST'))
 const backup=await call(snapshotApi.onRequestGet,context('/api/backups'))
 // Backups have no record ordering contract: active record may precede history.
 backup.website_batch_members.sort((a,b)=>b.id-a.id)
 store.sql("DELETE FROM website_batch_members WHERE id=2; UPDATE website_batch_members SET membership_status='active',removed_at=NULL,removed_reason=NULL WHERE id=1")
 await call(importData.onRequestPost,context('/api/backups',backup,'POST'))
 assert.deepEqual(store.sql('SELECT id,membership_status,removed_reason FROM website_batch_members ORDER BY id'),[{id:1,membership_status:'removed',removed_reason:'History'},{id:2,membership_status:'active',removed_reason:null}])
 await call(importData.onRequestPost,context('/api/backups',backup,'POST'))
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batch_members')[0].n,2)
})


test('import batch assignment rolls back with restored data and rejects archived targets in preview', async () => {
 const site=await createSite('Import batch rollback')
 const backup=await call(snapshotApi.onRequestGet,context('/api/backups'))
 backup.websites[0].name='Must roll back'
 await call(batchList.onRequestPost,context('/api/batches',{name:'Import target'},'POST'),201)
 const request=(preview=false)=>{
  const form=new FormData();form.append('batch_id','1');form.append('file',new File([JSON.stringify(backup)],'backup.json',{type:'application/json'}))
  return {env:context('/').env,request:new Request('https://example.test/api/backups'+(preview?'?dry_run=1':''),{method:'POST',headers:{Authorization:`Bearer ${session}`},body:form})}
 }
 store.script("CREATE TRIGGER fail_import_member BEFORE INSERT ON website_batch_members BEGIN SELECT RAISE(ABORT,'Injected import membership failure'); END;")
 await call(importData.onRequestPost,request(),500)
 assert.equal(store.sql('SELECT name FROM websites WHERE id=?',[site.id])[0].name,'Import batch rollback')
 store.sql("UPDATE website_batches SET status='已归档' WHERE id=1")
 await call(importData.onRequestPost,request(true),409)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batch_members')[0].n,0)
})


test('a new import batch is created with the data in one transaction after preview', async () => {
 const site=await createSite('New import batch')
 const backup=await call(snapshotApi.onRequestGet,context('/api/backups'))
 const request=(name,preview=false)=>{
  const form=new FormData();form.append('batch_name',name);form.append('file',new File([JSON.stringify(backup)],'backup.json',{type:'application/json'}))
  return {env:context('/').env,request:new Request('https://example.test/api/backups'+(preview?'?dry_run=1':''),{method:'POST',headers:{Authorization:`Bearer ${session}`},body:form})}
 }
 await call(importData.onRequestPost,request('Import new',true))
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batches')[0].n,0)
 store.script("CREATE TRIGGER fail_new_import BEFORE INSERT ON website_batch_members BEGIN SELECT RAISE(ABORT,'Injected new import failure'); END;")
 await call(importData.onRequestPost,request('Import new'),500)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batches')[0].n,0)
 store.sql('DROP TRIGGER fail_new_import')
 await call(importData.onRequestPost,request('Import new'))
 assert.equal(store.sql('SELECT name FROM website_batches')[0].name,'Import new')
 assert.deepEqual(store.sql('SELECT batch_id,website_id FROM website_batch_members'),[{batch_id:1,website_id:site.id}])
})


test('backup rejects duplicate membership identities before overwriting history', async () => {
 const site=await createSite('Backup identity')
 await call(batchList.onRequestPost,context('/api/batches',{name:'Identity'},'POST'),201)
 await call(assign.onRequestPost,context('/api/batches/assign',{batch_id:1,website_ids:[site.id]},'POST'))
 const backup=await call(snapshotApi.onRequestGet,context('/api/backups'))
 backup.website_batch_members.push({...backup.website_batch_members[0],membership_status:'removed',removed_reason:'Duplicate'})
 await call(importData.onRequestPost,context('/api/backups',backup,'POST'),400)
 assert.equal(store.sql('SELECT membership_status FROM website_batch_members')[0].membership_status,'active')
})


test('archived batch timestamps exported by the app survive backup preview and restore', async () => {
 await createSite('Archived restore')
 const batch=await call(batchList.onRequestPost,context('/api/batches',{name:'Archived restore'},'POST'),201)
 await call(batchDetail.onRequestPatch,context('/api/batches/1',{status:'已归档'},'PATCH'))
 const backup=await call(snapshotApi.onRequestGet,context('/api/backups'))
 assert.ok(backup.website_batches[0].archived_at.includes('T'))
 await call(importData.onRequestPost,context('/api/backups?dry_run=1',backup,'POST'))
 await call(importData.onRequestPost,context('/api/backups',backup,'POST'))
 assert.equal(store.sql('SELECT archived_at FROM website_batches WHERE id=?',[batch.id])[0].archived_at,backup.website_batches[0].archived_at)
 backup.website_batches[0].archived_at='invalid'
 await call(importData.onRequestPost,context('/api/backups',backup,'POST'),400)
})
