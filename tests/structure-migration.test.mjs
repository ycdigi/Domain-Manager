import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { database } from './helpers/database.mjs'
const legacy = fs.readFileSync(new URL('./fixtures/schema-v1.23.0.sql', import.meta.url), 'utf8')
test('v1.28 preserves membership history, permits repeat removals and can be safely reapplied', () => {
 const store=database()
 try {
  const current=fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8')
  const old=current.replace("    removed_reason TEXT\n);\nCREATE UNIQUE INDEX IF NOT EXISTS idx_website_batch_members_active ON website_batch_members(batch_id, website_id) WHERE membership_status='active';","    removed_reason TEXT,\n    UNIQUE(batch_id,website_id,membership_status)\n);")
  assert.notEqual(old,current);store.init(old)
  store.sql("INSERT INTO websites(id,name) VALUES(1,'Member'); INSERT INTO website_batches(id,name) VALUES(1,'Batch'); INSERT INTO website_batch_members(id,batch_id,website_id,member_note,membership_status,removed_reason) VALUES(3,1,1,'First','removed','Keep'),(4,1,1,'Second','active',NULL)")
  store.sql("INSERT INTO websites(id,name) VALUES(2,'Sequence'); INSERT INTO website_batch_members(id,batch_id,website_id,membership_status) VALUES(99,1,2,'removed'); DELETE FROM website_batch_members WHERE id=99")
  const sql=fs.readFileSync(new URL('../schema-migration-v1.28.0.sql',import.meta.url),'utf8')
  store.script(sql);store.script(sql)
  store.sql("UPDATE website_batch_members SET membership_status='removed' WHERE id=4; INSERT INTO website_batch_members(batch_id,website_id,membership_status) VALUES(1,1,'active')")
  assert.deepEqual(store.sql('SELECT id,member_note,removed_reason FROM website_batch_members WHERE id IN (3,4) ORDER BY id'),[{id:3,member_note:'First',removed_reason:'Keep'},{id:4,member_note:'Second',removed_reason:null}])
  assert.equal(store.sql("SELECT COUNT(*) n FROM website_batch_members WHERE membership_status='removed'")[0].n,2)
  assert.equal(store.sql("SELECT id FROM website_batch_members WHERE membership_status='active'")[0].id,100)
  assert.throws(()=>store.sql("INSERT INTO website_batch_members(batch_id,website_id,membership_status) VALUES(1,1,'active')"))
  assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
 } finally {store.close()}
})
test('v1.24 preserves all records while moving counts and primary-domain computer', () => {
  const store = database()
  try {
    store.init(legacy)
    store.sql(`INSERT INTO websites(name,wp_article_count,wp_calculator_count,page_count) VALUES('legacy',8,3,20);
 INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type,computer_name) VALUES(1,'example.com','r','2026-01-01','2027-01-01','网站','Mac Mini YC');
 INSERT INTO provider_accounts(provider,name,login_email) VALUES('github','main','user@example.com'),('cloudflare','main','cf@example.com');
 INSERT INTO provider_resources(account_id,provider,name) VALUES(1,'github','repo'),(2,'cloudflare','zone');
 INSERT INTO website_resources(website_id,resource_id,role,is_primary,memo) VALUES(1,1,'代码仓库',1,'preserve primary'),(1,1,'历史关联',0,'preserve duplicate'),(1,2,'DNS/CDN',0,'dns');
 INSERT INTO provider_credentials(account_id,label,ciphertext,status) VALUES(1,'main','encrypted','有效');`)
    store.script(fs.readFileSync(new URL('../schema-migration-v1.24.0.sql', import.meta.url), 'utf8'))
    assert.deepEqual(store.sql('SELECT calculator_count,article_count,page_count,computer_name FROM websites'), [
      { calculator_count: 3, article_count: 8, page_count: 20, computer_name: 'Mac Mini YC' }
    ])
    assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_resources')[0].n, 3)
    assert.equal(store.sql("SELECT memo FROM website_resources WHERE role='历史关联'")[0].memo, 'preserve duplicate')
    assert.equal(store.sql('SELECT is_default FROM provider_credentials')[0].is_default, 1)
    assert.deepEqual(store.sql('PRAGMA foreign_key_check'), [])
    store.sql('UPDATE websites SET article_count=12 WHERE id=1')
    assert.equal(store.sql('SELECT wp_article_count FROM websites')[0].wp_article_count, 12)
    assert.equal(
      store.sql("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].n,
      23
    )
  } finally {
    store.close()
  }
})

test('v1.25 migrates account ownership links without keeping placeholder deployment resources', () => {
  const store = database()
  try {
    store.init(fs.readFileSync(new URL('./fixtures/schema-v1.24.0.sql', import.meta.url), 'utf8'))
    store.sql(`INSERT INTO websites(name) VALUES('one'),('two');
INSERT INTO provider_accounts(provider,name) VALUES('vhost','SiteGround');
INSERT INTO provider_resources(account_id,provider,name,identifier) VALUES(1,'vhost','account placeholder','account:1');
INSERT INTO website_resources(website_id,resource_id,role,is_primary,memo) VALUES(1,1,'托管',1,'owner'),(2,1,'其他',0,'note');`)
    store.script(fs.readFileSync(new URL('../schema-migration-v1.25.0.sql', import.meta.url), 'utf8'))
    assert.deepEqual(store.sql('SELECT website_id,account_id,memo FROM website_accounts ORDER BY website_id'), [{website_id:1,account_id:1,memo:'owner'},{website_id:2,account_id:1,memo:'note'}])
    assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_resources')[0].n,0)
    assert.equal(store.sql('SELECT COUNT(*) AS n FROM provider_resources')[0].n,0)
    assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
  } finally { store.close() }
})

test('v1.26 removes retired structures while preserving canonical values and matching a fresh database', () => {
 const store=database();const fresh=database()
 try {
  store.init(fs.readFileSync(new URL('./fixtures/schema-v1.24.0.sql',import.meta.url),'utf8'))
  store.sql(`INSERT INTO websites(name,industry,wp_article_count,wp_calculator_count,page_count,computer_name) VALUES('kept','电气/工程',8,3,20,'Workstation');
INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type,computer_name) VALUES(1,'example.com','r','2026-01-01','2027-01-01','网站','Old computer');
INSERT INTO website_monitor_checks(website_id,domain,checked_at,outcome,reason,response_ms,final_url,content_complete) VALUES(1,'example.com','2026-11-20T00:00:00Z','review','title_changed',10,'https://example.com',0);
CREATE TABLE alertcfg(id INTEGER PRIMARY KEY,tg_token TEXT);`)
  store.script(fs.readFileSync(new URL('../schema-migration-v1.25.0.sql',import.meta.url),'utf8'))
  store.script(fs.readFileSync(new URL('../schema-migration-v1.26.0.sql',import.meta.url),'utf8'))
  assert.deepEqual(store.sql('SELECT article_count,calculator_count,page_count,computer_name,industry FROM websites'),[{article_count:8,calculator_count:3,page_count:20,computer_name:'Workstation',industry:'其他'}])
  assert.equal(store.sql('SELECT COUNT(*) AS n FROM website_monitor_checks')[0].n,0)
  assert.equal(store.sql("SELECT count(*) AS n FROM sqlite_schema WHERE name='alertcfg' OR name LIKE 'trg_counts_%'")[0].n,0)
  store.script(fs.readFileSync(new URL('../schema-migration-v1.27.0.sql',import.meta.url),'utf8'))
  store.script(fs.readFileSync(new URL('../schema-migration-v1.28.0.sql',import.meta.url),'utf8'))
  store.script(fs.readFileSync(new URL('../schema-migration-v1.29.0.sql',import.meta.url),'utf8'))
  store.script(fs.readFileSync(new URL('../schema-migration-v1.30.0.sql',import.meta.url),'utf8'))
  fresh.init()
  const structure=db=>db.sql("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(({name})=>({name,columns:db.sql(`PRAGMA table_info(${name})`).map(({cid,...column})=>column).sort((a,b)=>a.name.localeCompare(b.name)),foreignKeys:db.sql(`PRAGMA foreign_key_list(${name})`).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}))
  assert.deepEqual(structure(store),structure(fresh))
  const indexes=db=>db.sql("SELECT name,tbl_name FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name").map(row=>({...row,columns:db.sql(`PRAGMA index_info(${row.name})`),unique:db.sql(`PRAGMA index_list(${row.tbl_name})`).find(index=>index.name===row.name).unique}))
  assert.deepEqual(indexes(store),indexes(fresh))
  assert.deepEqual(store.sql("SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name"),fresh.sql("SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name"))
  assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
 }finally{store.close();fresh.close()}
})

test('v1.29 adds maintenance destinations while preserving websites and encrypted credentials',()=>{
 const store=database()
 try{
  const current=fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8')
  store.init(current.replace('    github_push_url TEXT,\n    wp_login_url TEXT,\n',''))
  store.sql("INSERT INTO websites(id,name) VALUES(1,'Keep'); INSERT INTO provider_accounts(id,provider,name) VALUES(1,'github','Main'); INSERT INTO provider_credentials(account_id,label,ciphertext,is_default) VALUES(1,'Default','encrypted-original',1)")
  store.script(fs.readFileSync(new URL('../schema-migration-v1.29.0.sql',import.meta.url),'utf8'))
  assert.deepEqual(store.sql('SELECT name,github_push_url,wp_login_url FROM websites'),[{name:'Keep',github_push_url:null,wp_login_url:null}])
  assert.equal(store.sql('SELECT ciphertext FROM provider_credentials')[0].ciphertext,'encrypted-original')
  assert.deepEqual(store.sql('PRAGMA foreign_key_check'),[])
 }finally{store.close()}
})
