import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { database } from './helpers/database.mjs'
const legacy = fs.readFileSync(new URL('./fixtures/schema-v1.23.0.sql', import.meta.url), 'utf8')
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
