import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
const store = database()
let session
const context = body => ({ env: { DB: store.db, USER: 'test', PASS: 'secret' }, request: new Request('https://test.local/api/websites/batch', { method: 'PATCH', headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
const call = async (body, status = 200) => {
 const { onRequestPatch } = await server.ssrLoadModule('/functions/api/websites/batch/index.ts')
 const response = await onRequestPatch(context(body)), result = await response.json()
 assert.equal(response.status, status, JSON.stringify(result))
 return result.data
}
beforeEach(async () => {
 store.init()
 session = await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test', 'secret')
 store.sql("INSERT INTO websites(id,name,computer_name) VALUES(1,'First','Old computer'),(2,'Second',NULL); INSERT INTO provider_accounts(id,provider,name,status) VALUES(1,'cloudflare','Cloudflare main','正常'),(2,'github','GitHub main','正常'),(3,'vps','Existing','正常'),(4,'github','Disabled','停用'); INSERT INTO website_accounts(website_id,account_id,memo) VALUES(1,3,'Preserve'); INSERT INTO gsc_accounts(id,name,email) VALUES(1,'Google main','owner@example.test')")
})
after(async () => { store.close(); await server.close() })

test('bulk settings update computers, append existing service accounts and assign GSC together; retries keep one link', async () => {
 const body = { website_ids: [1,2], fields: { computer_name: 'Mac Mini YC', ownership: '自营网站', platform: 'Astro' }, account_ids: [1,2], gsc_account_id: 1 }
 assert.equal((await call(body)).accepted, 2); await call(body)
 assert.deepEqual(store.sql('SELECT id,computer_name,ownership,platform FROM websites ORDER BY id'), [1,2].map(id => ({ id, computer_name: 'Mac Mini YC', ownership: '自营网站', platform: 'Astro' })))
 assert.deepEqual(store.sql('SELECT website_id,account_id FROM website_accounts ORDER BY website_id,account_id'), [{website_id:1,account_id:1},{website_id:1,account_id:2},{website_id:1,account_id:3},{website_id:2,account_id:1},{website_id:2,account_id:2}])
 assert.equal(store.sql('SELECT memo FROM website_accounts WHERE account_id=3')[0].memo, 'Preserve')
 assert.deepEqual(store.sql('SELECT website_id,account_id FROM website_gsc_accounts ORDER BY website_id'), [{website_id:1,account_id:1},{website_id:2,account_id:1}])
 assert.deepEqual(store.sql('SELECT gsc_connected FROM websites'), [{gsc_connected:'未知'},{gsc_connected:'未知'}])
})

test('bulk clear is explicit; omitted computer and GSC settings preserve their current values', async () => {
 await call({ website_ids:[1,2], gsc_account_id:1 })
 await call({ website_ids:[1,2], fields:{stage:'增长'}, account_ids:[1] })
 assert.equal(store.sql('SELECT computer_name FROM websites WHERE id=1')[0].computer_name, 'Old computer')
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_gsc_accounts')[0].n, 2)
 await call({ website_ids:[1], fields:{computer_name:null}, gsc_account_id:null })
 assert.equal(store.sql('SELECT computer_name FROM websites WHERE id=1')[0].computer_name, null)
 assert.deepEqual(store.sql('SELECT website_id FROM website_gsc_accounts'), [{website_id:2}])
})

test('bulk preflight rejects invalid, missing and disabled references before applying any changes', async () => {
 for (const extra of [{account_ids:[999]},{account_ids:[4]},{account_ids:[1,1]},{account_ids:[0]},{account_ids:'1'},{gsc_account_id:999},{gsc_account_id:0},{gsc_account_id:'1'}]) await call({website_ids:[1,2],fields:{computer_name:'Must not save'},...extra},400)
 await call({website_ids:[1,999],fields:{computer_name:'Must not save'},account_ids:[1],gsc_account_id:1},404)
 assert.equal(store.sql('SELECT computer_name FROM websites WHERE id=1')[0].computer_name, 'Old computer')
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_accounts')[0].n, 1)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_gsc_accounts')[0].n, 0)
})

test('bulk settings reject empty, malformed, unsupported and unauthenticated requests', async () => {
 for (const body of [null,[],{website_ids:[1]},{website_ids:[1],fields:{}},{website_ids:[1],fields:null,account_ids:[1]},{website_ids:[1],fields:{name:'Unsupported'}},{website_ids:[1],fields:{computer_name:42}},{website_ids:[1,1],account_ids:[1]},{website_ids:[1],account_ids:[1],unknown:true}]) await call(body,400)
 session='invalid'; await call({website_ids:[1],account_ids:[1]},401)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_accounts')[0].n, 1)
})

test('a failed bulk write rolls back website fields and every account association', async () => {
 store.script("CREATE TRIGGER fail_bulk_gsc BEFORE INSERT ON website_gsc_accounts WHEN NEW.website_id=2 BEGIN SELECT RAISE(ABORT,'Injected bulk failure'); END;")
 await call({website_ids:[1,2],fields:{computer_name:'Must roll back'},account_ids:[1,2],gsc_account_id:1},500)
 assert.equal(store.sql('SELECT computer_name FROM websites WHERE id=1')[0].computer_name, 'Old computer')
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_accounts')[0].n, 1)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_gsc_accounts')[0].n, 0)
})


test('bulk settings handle 200 selected websites within D1 limits while rejecting a larger selection', async () => {
 store.sql("WITH RECURSIVE ids(id) AS (SELECT 3 UNION ALL SELECT id+1 FROM ids WHERE id<200) INSERT INTO websites(id,name) SELECT id,'Website '||id FROM ids")
 const originalPrepare=store.db.prepare
 store.db.prepare=sql=>{const statement=originalPrepare(sql),bind=statement.bind;statement.bind=(...values)=>{assert.ok(values.length<=100);return bind.apply(statement,values)};return statement}
 const website_ids=Array.from({length:200},(_,index)=>index+1)
 try {
 assert.equal((await call({website_ids,fields:{computer_name:'Macbook Pro'},account_ids:[1],gsc_account_id:1})).accepted,200)
 assert.equal(store.sql("SELECT COUNT(*) n FROM websites WHERE computer_name='Macbook Pro'")[0].n,200)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_gsc_accounts')[0].n,200)
 await call({website_ids:[...website_ids,201],fields:{computer_name:'Must not save'}},400)
 } finally {store.db.prepare=originalPrepare}
})

test('bulk platform changes remove obsolete custom platform labels', async () => {
 store.sql("UPDATE websites SET platform='其他',platform_other='Old framework' WHERE id=1")
 await call({website_ids:[1],fields:{platform:'Astro'}})
 assert.deepEqual(store.sql('SELECT platform,platform_other FROM websites WHERE id=1'),[{platform:'Astro',platform_other:null}])
 await call({website_ids:[1],fields:{platform:'其他',platform_other:'SvelteKit'}})
 assert.equal(store.sql('SELECT platform_other FROM websites WHERE id=1')[0].platform_other,'SvelteKit')
 await call({website_ids:[1],fields:{platform_other:'Must not save'}},400)
 await call({website_ids:[1],fields:{platform:'其他'}})
 assert.deepEqual(store.sql('SELECT platform,platform_other FROM websites WHERE id=1'),[{platform:'其他',platform_other:null}])
})

test('bulk resource assignments update hosting and repository without changing shared resources or other websites', async () => {
 store.sql(`INSERT INTO websites(id,name) VALUES(3,'Outside selection');
 INSERT INTO provider_resources(id,account_id,provider,name,ip_address) VALUES(1,3,'vps','Old host','203.0.113.1'),(2,3,'vps','Shared host','203.0.113.2'),(3,2,'github','Shared repository',NULL);
 INSERT INTO website_resources(website_id,resource_id,role,is_primary,memo) VALUES(1,1,'托管',1,'Preserve old host'),(3,1,'托管',1,'Outside');`)
 const body={website_ids:[1,2],fields:{stage:'增长'},resource_assignments:[{role:'托管',resource_id:2},{role:'代码仓库',resource_id:3}]}
 await call(body);await call(body)
 assert.deepEqual(store.sql('SELECT website_id,resource_id,role,is_primary FROM website_resources ORDER BY website_id,resource_id'),[
  {website_id:1,resource_id:1,role:'托管',is_primary:0},{website_id:1,resource_id:2,role:'托管',is_primary:1},{website_id:1,resource_id:3,role:'代码仓库',is_primary:1},
  {website_id:2,resource_id:2,role:'托管',is_primary:1},{website_id:2,resource_id:3,role:'代码仓库',is_primary:1},{website_id:3,resource_id:1,role:'托管',is_primary:1}])
 assert.equal(store.sql('SELECT COUNT(*) n FROM provider_resources')[0].n,3)
 await call({website_ids:[1],resource_assignments:[{role:'托管',resource_id:null}]})
 assert.deepEqual(store.sql("SELECT resource_id FROM website_resources WHERE website_id=1 AND role='托管'"),[])
 assert.equal(store.sql('SELECT ip_address FROM provider_resources WHERE id=1')[0].ip_address,'203.0.113.1')
})

test('bulk account removal only removes explicit relations and resource validation happens before all writes', async () => {
 await call({website_ids:[1,2],account_ids:[1,2]})
 await call({website_ids:[1,2],remove_account_ids:[1]})
 assert.deepEqual(store.sql('SELECT website_id,account_id FROM website_accounts ORDER BY website_id,account_id'),[{website_id:1,account_id:2},{website_id:1,account_id:3},{website_id:2,account_id:2}])
 store.sql("INSERT INTO provider_resources(id,account_id,provider,name,status) VALUES(1,2,'github','Repo','正常'),(2,4,'github','Disabled account repo','正常'),(3,3,'vps','Disabled host','停用')")
 for(const resource_assignments of [[{role:'托管',resource_id:1}],[{role:'代码仓库',resource_id:2}],[{role:'托管',resource_id:3}],[{role:'托管',resource_id:999}],[{role:'托管',resource_id:1},{role:'托管',resource_id:null}],[{role:'bad',resource_id:1}]]) {
  await call({website_ids:[1,2],fields:{computer_name:'Must not save'},resource_assignments},400)
 }
 await call({website_ids:[1],account_ids:[2],remove_account_ids:[2]},400)
 assert.equal(store.sql('SELECT computer_name FROM websites WHERE id=1')[0].computer_name,'Old computer')
})

test('bulk existing batch and AdSense changes are validated and saved in the same transaction', async () => {
 store.sql("INSERT INTO website_batches(id,name,status) VALUES(1,'Active','进行中'),(2,'Archived','已归档'),(3,'Rollback','进行中'); INSERT INTO adsense_accounts(id,name,owner,status) VALUES(1,'Adsense main','ads@example.test','正常')")
 await call({website_ids:[1,2],fields:{adsense_account_id:1,new_site_override:1},batch_ids:[1]})
 await call({website_ids:[1,2],batch_ids:[1]})
 assert.equal(store.sql("SELECT COUNT(*) n FROM website_batch_members WHERE membership_status='active'")[0].n,2)
 assert.deepEqual(store.sql('SELECT adsense_account_id,new_site_override FROM websites ORDER BY id'),[{adsense_account_id:1,new_site_override:1},{adsense_account_id:1,new_site_override:1}])
 await call({website_ids:[1],fields:{computer_name:'Must not save'},batch_ids:[2]},400)
 await call({website_ids:[1],fields:{adsense_account_id:999}},400)
 store.script("CREATE TRIGGER fail_bulk_resource BEFORE INSERT ON website_resources BEGIN SELECT RAISE(ABORT,'Injected resource failure'); END;")
 store.sql("INSERT INTO provider_resources(id,account_id,provider,name) VALUES(1,3,'vps','Host')")
 await call({website_ids:[1,2],fields:{stage:'维护'},account_ids:[1],gsc_account_id:1,batch_ids:[3],resource_assignments:[{role:'托管',resource_id:1}]},500)
 assert.deepEqual(store.sql('SELECT stage FROM websites'),[{stage:'待评估'},{stage:'待评估'}])
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_gsc_accounts')[0].n,0)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_batch_members WHERE batch_id=3')[0].n,0)
})
