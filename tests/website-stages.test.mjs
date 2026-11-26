import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import fs from 'node:fs'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'})
const store=database()
const sites=await server.ssrLoadModule('/functions/api/websites/index.ts')
const edit=await server.ssrLoadModule('/functions/api/websites/[id].ts')
const bulk=await server.ssrLoadModule('/functions/api/websites/batch/index.ts')
const assign=await server.ssrLoadModule('/functions/api/batches/assign.ts')
const {exportBackup,restoreBackup}=await server.ssrLoadModule('/functions/domain/backup-restore.ts')
const {batchSnapshot}=await server.ssrLoadModule('/functions/domain/batches.ts')
const {isWebsiteNew}=await server.ssrLoadModule('/shared/website-newness.ts')
let token
beforeEach(async()=>{store.init();token=await(await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test','secret')})
after(async()=>{store.close();await server.close()})
const call=async(handler,path,body,method='GET',status=200)=>{
 const response=await handler({env:{DB:store.db,USER:'test',PASS:'secret'},params:{id:'1'},request:new Request('https://test.local'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})})
 const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result.data
}
const create=(stage,name=stage)=>call(sites.onRequestPost,'/api/websites',{name,stage,new_site_override:1,domain:{domain:'stage-'+encodeURIComponent(name).replaceAll('%','')+'.test',registrar:'r',registrar_date:'2026-01-01',expiry_date:'2027-01-01',service_type:'网站'}},'POST',201)
test('new stages persist through create, edit, filtering, bulk and backup without changing new-site classification',async()=>{
 await create('平稳');await create('下降')
 await call(edit.onRequestPatch,'/api/websites/1',{stage:'下降'},'PATCH')
 assert.deepEqual((await call(sites.onRequestGet,'/api/websites?stage=下降')).map(s=>[s.stage,s.is_new_site]),[['下降',true],['下降',true]])
 await call(bulk.onRequestPatch,'/api/websites/batch',{website_ids:[1,2],fields:{stage:'平稳'}},'PATCH')
 assert.deepEqual(store.sql('SELECT stage,new_site_override FROM websites ORDER BY id'),[{stage:'平稳',new_site_override:1},{stage:'平稳',new_site_override:1}])
 const backup=await exportBackup(store.db);store.init();assert.equal((await restoreBackup(store.db,backup)).status,200)
 assert.deepEqual(store.sql('SELECT stage,new_site_override FROM websites ORDER BY id'),[{stage:'平稳',new_site_override:1},{stage:'平稳',new_site_override:1}])
 await call(bulk.onRequestPatch,'/api/websites/batch',{website_ids:[1,2],fields:{stage:'not-a-stage'}},'PATCH',400)
 assert.equal(store.sql('SELECT COUNT(*) n FROM websites WHERE stage=\'平稳\'')[0].n,2)
})
test('new-site API filters combine with stage and preserve manual normal-site overrides',async()=>{
 await create('下降','New');await create('下降','Regular')
 await call(edit.onRequestPatch,'/api/websites/1',{new_site_override:0},'PATCH')
 assert.deepEqual((await call(sites.onRequestGet,'/api/websites?new=1&stage=下降')).map(s=>s.name),['Regular'])
 assert.deepEqual((await call(sites.onRequestGet,'/api/websites?new=0&stage=下降')).map(s=>s.name),['New'])
 assert.equal((await call(sites.onRequestGet,'/api/websites?new=1&stage=平稳')).length,0)
 assert.deepEqual(store.sql('SELECT stage,new_site_override FROM websites ORDER BY id'),[{stage:'下降',new_site_override:0},{stage:'下降',new_site_override:1}])
})
test('API stage ordering and batch assignment include stable and declining sites in their snapshots',async()=>{
 for(const stage of ['暂停','下降','维护','增长','平稳','验证','待评估'])await create(stage)
 assert.deepEqual((await call(sites.onRequestGet,'/api/websites')).map(s=>s.stage),['待评估','验证','增长','平稳','下降','维护','暂停'])
 await call(assign.onRequestPost,'/api/batches/assign',{website_ids:[1,2],batch:{name:'Stage batch'},website_fields:{stage:'下降'}},'POST',201)
 assert.deepEqual(store.sql('SELECT stage FROM websites WHERE id IN (1,2)'),[{stage:'下降'},{stage:'下降'}])
 assert.deepEqual(batchSnapshot(store.sql('SELECT stage FROM websites')).stage_counts,{'下降':2,'维护':1,'增长':1,'平稳':1,'验证':1,'待评估':1})
})
test('v1.30 changes the stage constraint while preserving every existing row, relationship, trigger and sequence',()=>{
 const old=fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8').replace("'增长', '平稳', '下降', '维护'","'增长', '维护'")
 store.init(old)
 store.sql("INSERT INTO websites(id,name,stage,new_site_override,github_push_url,wp_login_url) VALUES(7,'Keep','增长',1,'https://github.com/org/repo.git','https://keep.test/safelogin'); INSERT INTO domains(id,website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(9,7,'keep.test','r','2026-01-01','2027-01-01','网站'); INSERT INTO website_income(website_id,income_month,source,currency,amount) VALUES(7,'2026-11','AdSense','USD',10); INSERT INTO website_batches(id,name) VALUES(1,'Keep batch'); INSERT INTO website_batch_members(batch_id,website_id) VALUES(1,7); INSERT INTO websites(id,name) VALUES(100,'Sequence'); DELETE FROM websites WHERE id=100")
 const tables=store.sql("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r=>r.name)
 const before=Object.fromEntries(tables.map(t=>[t,store.sql('SELECT * FROM '+t)]))
 const triggers=store.sql("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name")
 store.script(fs.readFileSync(new URL('../schema-migration-v1.30.0.sql',import.meta.url),'utf8'))
 for(const table of tables)assert.deepEqual(store.sql('SELECT * FROM '+table),before[table],table)
 assert.deepEqual(store.sql("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name"),triggers)
 assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
 store.sql("UPDATE websites SET stage='下降' WHERE id=7; INSERT INTO websites(name,stage) VALUES('Stable','平稳')")
 assert.equal(store.sql("SELECT id FROM websites WHERE name='Stable'")[0].id,101)
 assert.throws(()=>store.sql("UPDATE websites SET stage='invalid' WHERE id=7"))
 assert.throws(()=>store.sql('DELETE FROM domains WHERE id=9'))
 store.sql('DELETE FROM websites WHERE id=7')
 assert.equal(store.sql('SELECT COUNT(*) n FROM domains WHERE website_id=7')[0].n,0)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_income WHERE website_id=7')[0].n,0)
})
test('new-site calendar-month cutoff clamps month-end and respects explicit classification overrides',()=>{
 for(const [override,registered,today,want] of [[null,'2026-02-28','2026-05-31',true],[null,'2026-02-27','2026-05-31',false],[null,'2024-02-29','2024-05-31',true],[null,'2026-02-31','2026-05-31',false],[null,'2026-06-01','2026-05-31',false],[1,'2020-01-01','2026-05-31',true],[0,'2026-05-01','2026-05-31',false]])assert.equal(isWebsiteNew(override,registered,today),want,registered)
})
