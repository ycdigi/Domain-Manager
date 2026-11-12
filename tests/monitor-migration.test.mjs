import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { database } from './helpers/database.mjs'

test('v1.22 migration preserves existing portfolio data and is safe to reapply', () => {
  const store = database()
  try {
    const initial = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
    store.init(initial.slice(0, initial.indexOf('-- Website monitoring runs in a separate Worker')))
    store.sql("INSERT INTO websites(id,name,stage) VALUES(1,'Existing','增长'); INSERT INTO domains(id,website_id,domain,registrar,registrar_date,expiry_date,service_type,status) VALUES(1,1,'existing.com','r','2026-01-01','2027-01-01','网站','在线');")
    const migration = fs.readFileSync(new URL('../schema-migration-v1.22.0.sql', import.meta.url), 'utf8')
    store.script(migration); store.script(migration)
    assert.deepEqual(store.sql('SELECT name,stage FROM websites'), [{name:'Existing',stage:'增长'}])
    assert.deepEqual(store.sql('SELECT domain,status FROM domains'), [{domain:'existing.com',status:'在线'}])
    store.sql("INSERT INTO website_monitor_checks(website_id,domain,checked_at,outcome,reason,response_ms,final_url,content_complete) VALUES(1,'existing.com','2026-11-12T00:00:00Z','healthy','healthy',10,'https://existing.com/',1)")
    assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_checks')[0].n,1)
    store.sql('DELETE FROM websites WHERE id=1')
    assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_checks')[0].n,0)
  } finally { store.close() }
})
