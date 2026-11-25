import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'
const server = await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'})
const { restoreBackup, exportBackup } = await server.ssrLoadModule('/functions/domain/backup-restore.ts')
const store = database()
beforeEach(() => store.init())
after(async () => {store.close(); await server.close()})
const snapshot = () => ({format_version:1,websites:[{id:1,name:'Restored'}],domains:[{id:1,website_id:1,domain:'restored.test',registrar:'r',registrar_date:'2026-01-01',expiry_date:'2027-01-01',service_type:'网站',is_primary:1}]})
test('repeating a standalone resource restore into an empty database is idempotent',async()=>{
 const input={...snapshot(),provider_resources:[{id:5,provider:'vps',name:'VPS',ip_address:'1.1.1.1'},{id:6,provider:'vps',name:'VPS',ip_address:'2.2.2.2'}],website_resources:[{website_id:1,resource_id:5,role:'托管',is_primary:1},{website_id:1,resource_id:6,role:'托管',is_primary:0}]}
 for(let attempt=0;attempt<2;attempt++) assert.equal((await restoreBackup(store.db,input)).status,200)
 assert.equal(store.sql('SELECT COUNT(*) AS n FROM provider_resources')[0].n,2)
 assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_resources')[0].n,2)
})
test('same-name standalone resources remain distinct through export and restore',async()=>{
 await restoreBackup(store.db,snapshot())
 store.sql("INSERT INTO provider_resources(id,provider,name,ip_address) VALUES(1,'vps','VPS','1.1.1.1'),(2,'vps','VPS','2.2.2.2')")
 store.sql("INSERT INTO website_resources(website_id,resource_id,role,is_primary,memo) VALUES(1,1,'托管',1,'first'),(1,2,'托管',0,'second')")
 assert.equal((await restoreBackup(store.db,await exportBackup(store.db))).status,200)
 assert.deepEqual(store.sql('SELECT r.ip_address,w.is_primary,w.memo FROM website_resources w JOIN provider_resources r ON r.id=w.resource_id ORDER BY r.id'),[{ip_address:'1.1.1.1',is_primary:1,memo:'first'},{ip_address:'2.2.2.2',is_primary:0,memo:'second'}])
})
test('preview rejects moving the last domain away from another website',async()=>{
 store.sql("INSERT INTO websites(id,name) VALUES(2,'Other')")
 store.sql("INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(2,'restored.test','r','2026-01-01','2027-01-01','网站')")
 for(const dryRun of [true,false]) assert.equal((await restoreBackup(store.db,snapshot(),{dryRun})).status,400)
 assert.equal(store.sql('SELECT website_id FROM domains')[0].website_id,2)
})
test('restoring an unowned resource never changes another provider with the same name',async()=>{
 store.sql("INSERT INTO websites(id,name) VALUES(2,'Other')")
 store.sql("INSERT INTO provider_resources(id,provider,name) VALUES(1,'github','Shared')")
 store.sql("INSERT INTO website_resources(website_id,resource_id,role) VALUES(2,1,'代码仓库')")
 const input={...snapshot(),provider_resources:[{id:5,provider:'vps',name:'Shared'}],website_resources:[{website_id:1,resource_id:5,role:'托管'}]}
 assert.equal((await restoreBackup(store.db,input,{dryRun:true})).status,200)
 assert.equal((await restoreBackup(store.db,input)).status,200)
 assert.deepEqual(store.sql('SELECT r.provider FROM website_resources w JOIN provider_resources r ON r.id=w.resource_id WHERE w.website_id=2'),[{provider:'github'}])
 assert.deepEqual(store.sql('SELECT r.provider FROM website_resources w JOIN provider_resources r ON r.id=w.resource_id WHERE w.website_id=1'),[{provider:'vps'}])
})
const cases = [
 ['negative income',{website_income:[{website_id:1,income_month:'2026-11',source:'Affiliate',currency:'USD',amount:-1}]}],
 ['negative effort',{website_effort:[{website_id:1,week_start:'2026-11-23',hours:-1}]}],
 ['invalid task status',{website_tasks:[{id:1,website_id:1,task_type:'SEO',title:'Task',status:'wrong'}]}],
 ['missing task title',{website_tasks:[{id:1,website_id:1,task_type:'SEO',status:'待做'}]}],
 ['invalid snapshot clicks',{website_tasks:[{id:1,website_id:1,task_type:'SEO',title:'Task',status:'待做'}],website_click_snapshots:[{task_id:1,period_kind:'before',period_start:'2026-01-01',period_end:'2026-01-28',clicks:-1}]}],
 ['invalid provider',{provider_accounts:[{id:1,provider:'unknown',name:'Account'}]}],
 ['missing AdSense owner',{adsense_accounts:[{id:1,name:'Account'}]}],
 ['missing resource account',{provider_resources:[{id:1,account_id:8,provider:'github',name:'Repo'}]}],
 ['invalid operation kind',{website_operations:[{website_id:1,operation_date:'2026-11-01',operation_kind:'wrong'}]}],
 ['invalid note kind',{website_ai_notes:[{id:1,website_id:1,kind:'wrong',content:'Note'}]}],
 ['missing batch name',{website_batches:[{id:1,status:'进行中'}]}],
 ['invalid membership state',{website_batches:[{id:1,name:'Batch',status:'进行中'}],website_batch_members:[{id:1,batch_id:1,website_id:1,membership_status:'wrong'}]}],
 ['negative review count',{website_batches:[{id:1,name:'Batch',status:'进行中'}],website_batch_reviews:[{id:1,batch_id:1,member_count:-1,stage_counts:'{}',content_totals:'{}'}]}]
]
for (const [label,collections] of cases) test('backup preview and execution reject '+label+' before writes',async()=>{
 for(const dryRun of [true,false]) {
  const result = await restoreBackup(store.db,{...snapshot(),...collections},{dryRun})
  assert.equal(result.status,400,JSON.stringify(result))
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM websites')[0].n,0)
 }
})
test('backup preview rejects an AdSense publisher identity owned by another existing account',async()=>{
 store.sql("INSERT INTO adsense_accounts(name,owner,publisher_id) VALUES('Old','Owner','pub-existing')")
 for(const dryRun of [true,false]) {
  const result=await restoreBackup(store.db,{...snapshot(),adsense_accounts:[{id:2,name:'New',owner:'Owner',publisher_id:'pub-existing'}]},{dryRun})
  assert.equal(result.status,400,JSON.stringify(result))
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM websites')[0].n,0)
 }
})
