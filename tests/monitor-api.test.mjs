import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const store = database(); let session
const module = path => server.ssrLoadModule(path)
const ctx = (body, id='1', token=session) => ({ env:{DB:store.db,USER:'test',PASS:'secret'},params:{id},request:new Request('https://manager.test/api/monitor',{method:body===undefined?'GET':'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}) })
beforeEach(async()=>{
 store.init(); store.sql("INSERT INTO websites(id,name,stage) VALUES(1,'One','验证'); INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(1,'one.test','r','2026-01-01','2027-01-01','网站');")
 session=await (await module('/functions/utils/auth.ts')).issueSessionToken('test','secret')
})
after(async()=>{store.close();await server.close()})
test('monitor endpoints require a login, not an API token or anonymous access',async()=>{
 const overview=await module('/functions/api/monitor/index.ts')
 for(const token of ['', 'api-token']) assert.equal((await overview.onRequestGet(ctx(undefined,'1',token))).status,401)
 const response=await overview.onRequestGet(ctx()); assert.equal(response.status,200)
 const data=(await response.json()).data; assert.equal(data.monitors[0].status,'unchecked');assert.equal(data.runner,null);assert.equal(data.unread_count,0)
})
test('configuration validates rules, updates them and releases old leases',async()=>{
 const api=await module('/functions/api/websites/[id]/monitor/index.ts')
 await api.onRequestGet(ctx())
 store.sql("UPDATE website_monitors SET lease_token='old',lease_until='2099-01-01',baseline_title='Old'")
 const response=await api.onRequestPatch(ctx({required_text:['Welcome'],forbidden_text:['Hacked'],allowed_redirect_hosts:['example.com'],enabled:false}))
 assert.equal(response.status,200)
 const data=(await response.json()).data.monitor
 assert.deepEqual(data.required_text,['Welcome']);assert.equal(data.status,'disabled')
 assert.equal(store.sql('SELECT lease_token FROM website_monitors')[0].lease_token,null)
 for (const body of [{enabled:1},{required_text:'bad'},{allowed_redirect_hosts:['http://example.com']},{baseline_title:'x'.repeat(1001)},{unexpected:true}]) assert.equal((await api.onRequestPatch(ctx(body))).status,400)
 assert.equal((await api.onRequestGet(ctx(undefined,'999'))).status,404)
})
test('marking an incident read preserves its open fault state',async()=>{
 await (await module('/functions/api/monitor/index.ts')).onRequestGet(ctx())
 store.sql("INSERT INTO website_monitor_incidents(website_id,domain,reason,opened_at,last_seen_at) VALUES(1,'one.test','HTTP 500','2026-11-12','2026-11-12'); UPDATE website_monitors SET status='failure'")
 const api=await module('/functions/api/monitor/incidents/[id]/read.ts')
 assert.equal((await api.onRequestPost(ctx({}))).status,200)
 const data=(await (await (await module('/functions/api/monitor/index.ts')).onRequestGet(ctx())).json()).data
 assert.equal(data.unread_count,0);assert.equal(data.monitors[0].status,'failure');assert.equal(data.incidents[0].resolved_at,null)
})

test('legacy content checks are shown as awaiting a lightweight recheck',async()=>{
 store.sql("UPDATE website_monitors SET status='incomplete',reason='content_extraction_limit',http_status=200,checked_at='2026-11-12T00:00:00.000Z'")
 const response=await (await module('/functions/api/monitor/index.ts')).onRequestGet(ctx())
 const item=(await response.json()).data.monitors[0]
 assert.equal(item.status,'unchecked');assert.equal(item.reason,null)
})
