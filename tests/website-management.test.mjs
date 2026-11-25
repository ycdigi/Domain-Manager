import assert from 'node:assert/strict'
import { test, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'
const server = await createServer({ configFile:false, optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true}, appType:'custom' })
const store = database()
let session
const ctx = (body, method='GET', id='1', record_id='1', url='/api/test') => ({ env:{DB:store.db,USER:'test',PASS:'secret'}, params:{id,record_id}, request:new Request('https://test.local'+url,{method,headers:{Authorization:`Bearer ${session}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}) })
const call = async (module, handler, context, status=200) => {
 const api=await server.ssrLoadModule(module); const response=await api[handler](context); const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body.data
}
const records='/functions/api/websites/[id]/work-records/index.ts'
const undo='/functions/api/websites/[id]/work-records/[record_id].ts'
const overview='/functions/api/website-management/index.ts'
const accounts='/functions/api/gsc/accounts/index.ts'
const account='/functions/api/gsc/accounts/[id].ts'
const assignment='/functions/api/websites/[id]/gsc-account.ts'
const backups='/functions/api/backups/index.ts'
const site = async () => call('/functions/api/websites/index.ts','onRequestPost',ctx({name:'Example',domain:{domain:'example.test',registrar:'r',registrar_date:'2026-01-01',expiry_date:'2027-01-01',service_type:'网站'}},'POST'),201)
const record = (request_id='request_00000001',kind='TDK调整') => call(records,'onRequestPost',ctx({kind,request_id},'POST'),201)
beforeEach(async()=>{store.init();session=await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test','secret')})
after(async()=>{store.close();await server.close()})
test('new table starts at zero; same-day records count separately and legacy days are not inferred',async()=>{
 await site();store.sql("INSERT INTO website_operations(website_id,operation_date,operation_kind) VALUES(1,'2026-11-21','SEO')")
 let [row]=await call(overview,'onRequestGet',ctx());assert.equal(row.stats['TDK调整'].count,0);assert.equal(row.gsc_account,null)
 const first=await record();await record('request_00000002')
 assert.equal(first.stats['TDK调整'].count,1)
 ;[row]=await call(overview,'onRequestGet',ctx());assert.equal(row.stats['TDK调整'].count,2);assert.match(row.stats['TDK调整'].last_at,/^\d{4}-.*Z$/)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_operations')[0].n,1)
})
test('request retries are idempotent and cannot be reused for a different kind',async()=>{
 await site();await record();let result=await call(records,'onRequestPost',ctx({kind:'TDK调整',request_id:'request_00000001'},'POST'))
 assert.equal(result.stats['TDK调整'].count,1)
 await call(records,'onRequestPost',ctx({kind:'样式调整',request_id:'request_00000001'},'POST'),409)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_work_records')[0].n,1)
})
test('undo is scoped to its website, removes active count and never resurrects on retry',async()=>{
 await site();const first=await record();await record('request_00000002');store.sql("UPDATE website_work_records SET created_at='2026-11-20T00:00:00.000Z' WHERE id=?",[first.record.id])
 await call(undo,'onRequestDelete',ctx(undefined,'DELETE','2','1'),404)
 let result=await call(undo,'onRequestDelete',ctx(undefined,'DELETE','1','2'));assert.equal(result.stats['TDK调整'].count,1);assert.equal(result.stats['TDK调整'].last_at,'2026-11-20T00:00:00.000Z')
 await call(undo,'onRequestDelete',ctx(undefined,'DELETE','1','2'))
 result=await call(records,'onRequestPost',ctx({kind:'TDK调整',request_id:'request_00000002'},'POST'));assert.equal(result.stats['TDK调整'].count,1)
 const history=await call(records,'onRequestGet',ctx(undefined,'GET','1','1','/api/test?kind=TDK%E8%B0%83%E6%95%B4'));assert.equal(history.length,1)
})
test('mutations require session auth, valid kind, request identity and existing website',async()=>{
 await site();await call(records,'onRequestPost',ctx({kind:'未知',request_id:'request_00000001'},'POST'),400)
 await call(records,'onRequestPost',ctx({kind:'文章开发',request_id:''},'POST'),400)
 await call(records,'onRequestPost',ctx({kind:'文章开发',request_id:'request_00000001'},'POST','999'),404)
 const unsigned=ctx({kind:'文章开发',request_id:'request_00000001'},'POST');unsigned.request.headers.delete('Authorization');await call(records,'onRequestPost',unsigned,401)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_work_records')[0].n,0)
})
test('GSC accounts rename by stable identity; binding is single and independent of connected state',async()=>{
 await site();const created=await call(accounts,'onRequestPost',ctx({name:'Google A',email:'owner@example.test'},'POST'),201)
 await call(assignment,'onRequestPatch',ctx({account_id:created.id},'PATCH'))
 await call(account,'onRequestPatch',ctx({name:'Google renamed',email:'owner@example.test'},'PATCH',String(created.id)))
 const [row]=await call(overview,'onRequestGet',ctx());assert.equal(row.gsc_account.name,'Google renamed')
 assert.equal(store.sql('SELECT gsc_connected FROM websites')[0].gsc_connected,'未知')
 await call(account,'onRequestDelete',ctx(undefined,'DELETE',String(created.id)),409)
 await call(assignment,'onRequestPatch',ctx({account_id:999},'PATCH'),400)
 await call(assignment,'onRequestPatch',ctx({account_id:null},'PATCH'))
 await call(account,'onRequestDelete',ctx(undefined,'DELETE',String(created.id)))
})
test('GSC duplicate emails and invalid accounts are rejected without partial writes',async()=>{
 await call(accounts,'onRequestPost',ctx({name:'Google A',email:'owner@example.test'},'POST'),201)
 await call(accounts,'onRequestPost',ctx({name:'Google B',email:'OWNER@example.test'},'POST'),409)
 await call(accounts,'onRequestPost',ctx({name:'',email:'bad'},'POST'),400)
 assert.equal(store.sql('SELECT COUNT(*) n FROM gsc_accounts')[0].n,1)
})
test('backup round trip keeps clicks, undo tombstones and GSC associations, with preflight validation',async()=>{
 await site();await record();await record('request_00000002','文章开发');await call(undo,'onRequestDelete',ctx(undefined,'DELETE','1','1'))
 const a=await call(accounts,'onRequestPost',ctx({name:'Google A',email:'owner@example.test'},'POST'),201);await call(assignment,'onRequestPatch',ctx({account_id:a.id},'PATCH'))
 const snapshot=await call(backups,'onRequestGet',ctx());assert.equal(snapshot.website_work_records.length,2);assert.equal(snapshot.gsc_accounts.length,1)
 const malformed=structuredClone(snapshot);malformed.website_gsc_accounts[0].account_id=999
 await call(backups,'onRequestPost',ctx(malformed,'POST'),400)
 store.init();await call(backups,'onRequestPost',ctx(snapshot,'POST'));await call(backups,'onRequestPost',ctx(snapshot,'POST'))
 const [row]=await call(overview,'onRequestGet',ctx());assert.equal(row.stats['TDK调整'].count,0);assert.equal(row.stats['文章开发'].count,1);assert.equal(row.gsc_account.email,'owner@example.test')
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_work_records')[0].n,2);assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
})
test('v1.27 migration is additive and repeatable on a populated production-shaped schema',()=>{
 const old=execFileSync('git',['show','HEAD:schema.sql'],{encoding:'utf8'});store.init(old)
 store.sql("INSERT INTO websites(name) VALUES('Preserved'); INSERT INTO website_operations(website_id,operation_date,operation_kind) VALUES(1,'2026-11-21','SEO');")
 const sql=readFileSync(new URL('../schema-migration-v1.27.0.sql',import.meta.url),'utf8');store.script(sql);store.script(sql)
 assert.equal(store.sql('SELECT name FROM websites')[0].name,'Preserved');assert.equal(store.sql('SELECT COUNT(*) n FROM website_operations')[0].n,1);assert.equal(store.sql('SELECT COUNT(*) n FROM website_work_records')[0].n,0);assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
})

test('Excel summary uses the backup records, excludes undone work and preserves GSC labels',async()=>{
 const {managementExportRows}=await server.ssrLoadModule('/shared/website-management.ts')
 const result=managementExportRows({websites:[{id:7,name:'Example'}],domains:[{website_id:7,domain:'example.test',is_primary:1}],gsc_accounts:[{id:9,name:'Google',email:'a@example.test'}],website_gsc_accounts:[{website_id:7,account_id:9}],website_work_records:[{website_id:7,kind:'TDK调整',created_at:'2026-11-21T00:00:00.000Z',voided_at:null},{website_id:7,kind:'TDK调整',created_at:'2026-11-22T00:00:00.000Z',voided_at:'2026-11-22T01:00:00.000Z'}]})
 assert.equal(result[0]['TDK调整次数'],1);assert.equal(result[0]['TDK调整最近时间UTC'],'2026-11-21T00:00:00.000Z');assert.equal(result[0]['GSC归属'],'Google');assert.equal(result[0]['文章开发次数'],0)
})

test('restoring a GSC backup after an email edit reuses the named account and its links',async()=>{
 await site();const a=await call(accounts,'onRequestPost',ctx({name:'Google A',email:'before@example.test'},'POST'),201)
 await call(assignment,'onRequestPatch',ctx({account_id:a.id},'PATCH'))
 const snapshot=await call(backups,'onRequestGet',ctx())
 await call(account,'onRequestPatch',ctx({name:'Google A',email:'after@example.test'},'PATCH',String(a.id)))
 await call(backups,'onRequestPost',ctx(snapshot,'POST'))
 const [row]=await call(overview,'onRequestGet',ctx());assert.equal(row.gsc_account.id,a.id);assert.equal(row.gsc_account.email,'before@example.test')
 assert.equal(store.sql('SELECT COUNT(*) n FROM gsc_accounts')[0].n,1)
})

test('conflicting GSC restore identities fail preflight and leave all data untouched',async()=>{
 await site();await call(accounts,'onRequestPost',ctx({name:'Google A',email:'a@example.test'},'POST'),201)
 await call(accounts,'onRequestPost',ctx({name:'Google B',email:'b@example.test'},'POST'),201)
 const snapshot=await call(backups,'onRequestGet',ctx());snapshot.websites[0].name='Must not save'
 snapshot.gsc_accounts=[{...snapshot.gsc_accounts[0],email:'b@example.test'}]
 await call(backups,'onRequestPost',ctx(snapshot,'POST','1','1','/api/backups?dry_run=1'),400)
 await call(backups,'onRequestPost',ctx(snapshot,'POST'),400)
 assert.equal(store.sql('SELECT name FROM websites')[0].name,'Example')
 assert.deepEqual(store.sql('SELECT name,email FROM gsc_accounts ORDER BY id'),[{name:'Google A',email:'a@example.test'},{name:'Google B',email:'b@example.test'}])
})

test('backup restores undated historical metrics without inventing a measurement date',async()=>{
 await site();store.sql("UPDATE websites SET daily_clicks=12,clicks_updated_date=NULL,article_count=3,content_stats_updated_date=NULL WHERE id=1")
 const snapshot=await call(backups,'onRequestGet',ctx())
 await call(backups,'onRequestPost',ctx(snapshot,'POST','1','1','/api/backups?dry_run=1'))
 store.init();await call(backups,'onRequestPost',ctx(snapshot,'POST'))
 assert.deepEqual(store.sql('SELECT daily_clicks,clicks_updated_date,article_count,content_stats_updated_date FROM websites'),[{daily_clicks:12,clicks_updated_date:null,article_count:3,content_stats_updated_date:null}])
 const invalid=structuredClone(snapshot);invalid.websites[0].daily_clicks=-1
 await call(backups,'onRequestPost',ctx(invalid,'POST'),400)
})
