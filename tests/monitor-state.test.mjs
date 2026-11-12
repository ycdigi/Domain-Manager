import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const store = database()
const now = '2026-11-12T00:00:00.000Z'
const failure = { outcome: 'failure', reason: 'HTTP 500', http_status: 500, response_ms: 50, final_url: 'https://one.test/', title: null, content_complete: true, available: false }
const healthy = { ...failure, outcome: 'healthy', reason: '', http_status: 200, available: true, title: 'One' }
let monitor
beforeEach(() => {
  store.init()
  store.sql(`INSERT INTO websites(id,name,stage) VALUES(1,'One','验证'),(2,'Paused','暂停'),(3,'Stopped','维护'); UPDATE websites SET lifecycle='stopped' WHERE id=3;
    INSERT INTO domains(id,website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(1,1,'one.test','r','2026-01-01','2027-01-01','网站'),(2,2,'paused.test','r','2026-01-01','2027-01-01','网站'),(3,3,'stopped.test','r','2026-01-01','2027-01-01','网站');`)
  store.sql("UPDATE website_monitors SET next_check_at='1970-01-01T00:00:00.000Z'")
})
after(async () => { store.close(); await server.close() })
const load = async () => monitor ||= await server.ssrLoadModule('/functions/domain/monitor.ts')

test('monitor storage exists and website deletion cascades its monitoring data', async () => {
  const tables = store.sql("SELECT name FROM sqlite_schema WHERE type='table'").map(row => row.name)
  for (const name of ['website_monitors', 'website_monitor_checks', 'website_monitor_incidents', 'monitor_runner']) assert.ok(tables.includes(name), `missing ${name}`)
  const m = await load()

  await m.checkOne(store.db, 1, { now, checker: async () => failure })
  await m.checkOne(store.db, 1, { now: '2026-11-12T00:05:00.000Z', checker: async () => failure })
  store.sql('DELETE FROM websites WHERE id=1')
  assert.equal(store.sql('SELECT * FROM website_monitors WHERE website_id=1').length, 0)
  assert.equal(store.sql('SELECT * FROM website_monitor_checks WHERE website_id=1').length, 0)
  assert.equal(store.sql('SELECT * FROM website_monitor_incidents WHERE website_id=1').length, 0)
})

test('two failures open one incident, read does not resolve it, and success recovers it', async () => {
  const m = await load()

  await m.checkOne(store.db, 1, { now, checker: async () => failure })
  let row = store.sql('SELECT * FROM website_monitors WHERE website_id=1')[0]
  assert.equal(row.status, 'pending'); assert.equal(row.next_check_at, '2026-11-12T00:05:00.000Z')
  assert.equal(store.sql('SELECT * FROM website_monitor_incidents').length, 0)
  await m.checkOne(store.db, 1, { now: '2026-11-12T00:05:00.000Z', checker: async () => failure })
  await m.checkOne(store.db, 1, { now: '2026-11-12T00:10:00.000Z', checker: async () => failure })
  assert.equal(store.sql('SELECT * FROM website_monitor_incidents').length, 1)
  assert.equal(store.sql('SELECT status FROM website_monitors WHERE website_id=1')[0].status, 'failure')
  store.sql("UPDATE website_monitor_incidents SET read_at=?", [now])
  assert.equal(store.sql('SELECT resolved_at FROM website_monitor_incidents')[0].resolved_at, null)
  await m.checkOne(store.db, 1, { now: '2026-11-12T00:15:00.000Z', checker: async () => healthy })
  row = store.sql('SELECT * FROM website_monitors WHERE website_id=1')[0]
  assert.equal(row.status, 'healthy'); assert.equal(row.consecutive_failures, 0)
  assert.equal(row.next_check_at, '2026-11-12T12:15:00.000Z'); assert.equal(row.baseline_title, 'One')
  assert.equal(store.sql('SELECT resolved_at FROM website_monitor_incidents')[0].resolved_at, '2026-11-12T00:15:00.000Z')
})

test('title review and incomplete content stay separate from domain availability', async () => {
  const m = await load();
  await m.checkOne(store.db, 1, { now, checker: async () => ({ ...healthy, outcome: 'review', reason: '标题发生变化' }) })
  assert.equal(store.sql('SELECT status FROM domains WHERE id=1')[0].status, '在线')
  assert.equal(store.sql('SELECT status FROM website_monitors WHERE website_id=1')[0].status, 'review')
  await m.checkOne(store.db, 1, { now, checker: async () => ({ ...healthy, outcome: 'incomplete', reason: '内容检查未完成', content_complete: false }) })
  assert.equal(store.sql('SELECT status FROM website_monitors WHERE website_id=1')[0].status, 'incomplete')
})

test('a lease prevents overlapping checks and a changed primary domain rejects stale results', async () => {
  const m = await load();
  let release
  const running = m.checkOne(store.db, 1, { now, checker: () => new Promise(resolve => { release = resolve }) })
  while (!release) await new Promise(resolve => setTimeout(resolve, 0))
  await assert.rejects(m.checkOne(store.db, 1, { now, checker: async () => healthy }), /正在检查/)
  store.sql("UPDATE domains SET domain='new.test' WHERE id=1")

  release(healthy); await running
  assert.equal(store.sql('SELECT * FROM website_monitor_checks').length, 0)
  const row = store.sql('SELECT * FROM website_monitors WHERE website_id=1')[0]
  assert.equal(row.domain, 'new.test'); assert.equal(row.baseline_title, null); assert.equal(row.status, 'unchecked')
})

test('a free-budget scheduled tick checks one of 100 sites, excludes paused/stopped, and prunes old checks', async () => {
  const m = await load()
  for (let id = 4; id <= 102; id++) {
    store.sql("INSERT INTO websites(id,name) VALUES(?,?)", [id, `Site ${id}`])
    store.sql("INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(?,?,'r','2026-01-01','2027-01-01','网站')", [id, `site${id}.test`])
  }
  store.sql("UPDATE website_monitors SET next_check_at=\'1970-01-01T00:00:00.000Z\'")
  let concurrent = 0; let maxConcurrent = 0; const checked = []
  const checker = async input => { concurrent++; maxConcurrent = Math.max(concurrent, maxConcurrent); checked.push(input.domain); await new Promise(resolve => setTimeout(resolve, 5)); concurrent--; return healthy }
  await m.runMonitorTick(store.db, { now, checker })
  assert.equal(checked.length, 1); assert.equal(maxConcurrent, 1)
  assert.ok(!checked.includes('paused.test') && !checked.includes('stopped.test'))
  store.sql("UPDATE website_monitor_checks SET checked_at='2026-09-01T00:00:00.000Z'")
  await m.runMonitorTick(store.db, { now: '2026-11-12T00:01:00.000Z', checker })
  assert.equal(checked.length, 2)
  assert.equal(store.sql("SELECT * FROM website_monitor_checks WHERE checked_at < '2026-10-13'").length, 0)
  assert.equal(store.sql('SELECT last_completed_at FROM monitor_runner')[0].last_completed_at, '2026-11-12T00:01:00.000Z')
})

test('changing primary resolves the old-domain incident and resets the title sample', async () => {
  const m = await load();
  await m.checkOne(store.db, 1, { now, checker: async () => healthy })
  await m.checkOne(store.db, 1, { now, checker: async () => failure })
  await m.checkOne(store.db, 1, { now, checker: async () => failure })
  store.sql("UPDATE domains SET is_primary=0 WHERE id=1; INSERT INTO domains(id,website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(4,1,'other.test','r','2026-01-01','2027-01-01','网站');")

  const row=store.sql('SELECT * FROM website_monitors WHERE website_id=1')[0]
  assert.equal(row.domain_id,4);assert.equal(row.baseline_title,null);assert.equal(row.consecutive_failures,0)
  assert.ok(store.sql('SELECT resolved_at FROM website_monitor_incidents')[0].resolved_at)
  assert.equal(store.sql('SELECT domain FROM website_monitor_checks LIMIT 1')[0].domain,'one.test')
})

test('configuration edited during a fetch rejects the old check and legacy status date uses Shanghai', async () => {
  const m = await load();
  let release
  const running=m.checkOne(store.db,1,{now,checker:()=>new Promise(resolve=>{release=resolve})})
  while(!release) await new Promise(resolve=>setTimeout(resolve,0))
  await m.patchMonitor(store.db,1,{required_text:['new rule']})
  release(healthy);await running
  assert.equal(store.sql('SELECT * FROM website_monitor_checks').length,0)
  await m.checkOne(store.db,1,{now:'2026-11-12T23:00:00.000Z',checker:async()=>healthy})
  assert.equal(store.sql('SELECT last_status_check_at FROM domains WHERE id=1')[0].last_status_check_at,'2026-11-13')
})

test('website and primary-domain mutations maintain monitoring state without polling writes', async () => {
  assert.equal(store.sql('SELECT domain FROM website_monitors WHERE website_id=1')[0]?.domain,'one.test')
  const m=await load()
  const before=store.sql('SELECT * FROM website_monitors WHERE website_id=1')[0]
  await m.getMonitorOverview(store.db);await m.getMonitorDetail(store.db,1)
  assert.deepEqual(store.sql('SELECT * FROM website_monitors WHERE website_id=1')[0],before)
})

test('due failure confirmations take precedence over unchecked websites', async () => {
  const m=await load();
  for(let id=4;id<=20;id++){
    store.sql('INSERT INTO websites(id,name) VALUES(?,?)',[id,`Site ${id}`])
    store.sql("INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(?,?,'r','2026-01-01','2027-01-01','网站')",[id,`site${id}.test`])
  }
  store.sql("UPDATE website_monitors SET next_check_at=\'1970-01-01T00:00:00.000Z\'")
  await m.checkOne(store.db,1,{now,checker:async()=>failure})
  const checked=[]
  await m.runMonitorTick(store.db,{now:'2026-11-12T00:05:00.000Z',checker:async input=>{checked.push(input.domain);return failure}})
  assert.ok(checked.includes('one.test'))
  assert.equal(store.sql('SELECT status FROM website_monitors WHERE website_id=1')[0].status,'failure')
})

test('scheduled results are discarded when a site is disabled while checking; manual checks remain available', async () => {
  const m=await load()
  for(let id=4;id<=8;id++){
    store.sql('INSERT INTO websites(id,name) VALUES(?,?)',[id,`Site ${id}`])
    store.sql("INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(?,?,'r','2026-01-01','2027-01-01','网站')",[id,`site${id}.test`])
  }
  store.sql("UPDATE website_monitors SET next_check_at=\'1970-01-01T00:00:00.000Z\'")
  const checked=[];let disabled=false
  await m.runMonitorTick(store.db,{now,checker:async input=>{
    checked.push(input.domain)
    if(!disabled){disabled=true;await m.patchMonitor(store.db,1,{enabled:false})}
    return healthy
  }})
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_checks WHERE website_id=1')[0].n,0)
  await m.checkOne(store.db,1,{now,checker:async input=>{checked.push(input.domain);return healthy}})
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_checks WHERE website_id=1')[0].n,1)
})

test('an incomplete representation does not initialize a missing-title baseline',async()=>{
  const m=await load()
  await m.checkOne(store.db,1,{now,checker:async()=>({...healthy,title:null,content_complete:false})})
  assert.equal(store.sql('SELECT baseline_title FROM website_monitors WHERE website_id=1')[0].baseline_title,null)
  await m.checkOne(store.db,1,{now,checker:async()=>({...healthy,title:null})})
  assert.equal(store.sql('SELECT baseline_title FROM website_monitors WHERE website_id=1')[0].baseline_title,'')
})

test('a full scheduled check uses at most three D1 round trips including heartbeat and result writes',async()=>{
  const m=await load();let calls=0
  const db={
    prepare(sql){const stmt=store.db.prepare(sql);return {
      bind(...values){stmt.bind(...values);return this},query(){return stmt.query()},
      async first(){calls++;return stmt.first()},async all(){calls++;return stmt.all()},async run(){calls++;return stmt.run()}
    }},
    async batch(statements){calls++;return store.db.batch(statements)}
  }
  await m.runMonitorTick(db,{now,checker:async()=>healthy})
  assert.equal(store.sql('SELECT status FROM website_monitors WHERE website_id=1')[0].status,'healthy')
  assert.ok(calls<=3,`D1 round trips: ${calls}`)
})

test('automatic leasing skips a website already rescheduled by a completed manual check',async()=>{
  const m=await load()
  await m.checkOne(store.db,1,{now,checker:async()=>failure})
  let fetched=false
  await assert.rejects(m.checkOne(store.db,1,{now,automatic:true,checker:async()=>{fetched=true;return failure}}),/正在检查|尚未到期/)
  assert.equal(fetched,false)
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_incidents')[0].n,0)
})
