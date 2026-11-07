import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { database } from './helpers/database.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migration = fs.readFileSync(path.join(root, 'schema-migration-v1.15.0.sql'), 'utf8')
const legacySchema = fs.readFileSync(path.join(root, 'tests/fixtures/schema-v1.14.sql'), 'utf8')

test('v1.15 migration creates one pending-review website per legacy domain and moves its records', () => {
  const store = database()
  try {
    store.init(legacySchema)
    store.sql(`
      INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type, site_name, ownership, platform, industry, adsense_connected, daily_clicks, daily_clicks_range, clicks_updated_date)
      VALUES ('example.test', 'registrar', '2024-01-01', '2027-01-01', '网站', 'Example', '自营网站', 'Astro', '资讯站', '已开通', 42, '30to49', '2026-10-01');
      INSERT INTO adsense_accounts(name, owner) VALUES ('main', 'self');
      UPDATE domains SET adsense_account_id = 1 WHERE id = 1;
      INSERT INTO adsense_income(adsense_account_id, income_month, amount, amount_usd) VALUES (1, '2026-09', 12, 12);
      INSERT INTO adsense_income_domains(income_id, domain_id, amount_usd) VALUES (1, 1, 8.5);
      INSERT INTO provider_accounts(provider, name) VALUES ('github', 'source');
      INSERT INTO provider_resources(account_id, provider, name) VALUES (1, 'github', 'repo');
      INSERT INTO domain_resources(domain_id, resource_id, role, is_primary) VALUES (1, 1, '代码仓库', 1);
      INSERT INTO domain_operations(domain_id, operation_date, operation_kind) VALUES (1, '2026-09-01', 'SEO');
      INSERT INTO domain_todos(domain_id, title, description) VALUES (1, '优化着陆页', '更新正文');
      INSERT INTO domain_ai_notes(domain_id, kind, content) VALUES (1, 'AI提示词', '内容提示');
    `)
    store.script('PRAGMA foreign_keys=ON;\n' + migration)

    assert.deepEqual(store.sql('SELECT id, name, stage, ownership, platform, industry, adsense_connected, daily_clicks FROM websites;'), [
      { id: 1, name: 'Example', stage: '待评估', ownership: '自营网站', platform: 'Astro', industry: '资讯站', adsense_connected: '已开通', daily_clicks: 42 }
    ])
    assert.deepEqual(store.sql('SELECT id, website_id, domain, registrar, expiry_date FROM domains;'), [
      { id: 1, website_id: 1, domain: 'example.test', registrar: 'registrar', expiry_date: '2027-01-01' }
    ])
    const domainColumns = store.sql('PRAGMA table_info(domains);').map(column => column.name)
    assert.deepEqual(domainColumns, ['id', 'website_id', 'domain', 'registrar', 'registrar_link', 'registrar_date', 'expiry_date', 'service_type', 'domain_role', 'is_primary', 'status', 'memo', 'last_status_check_at', 'computer_name', 'created_at'])
    assert.deepEqual(store.sql('SELECT website_id, title, task_type, status FROM website_tasks;'), [
      { website_id: 1, title: '优化着陆页', task_type: '其他', status: '待做' }
    ])
    assert.deepEqual(store.sql('SELECT website_id, income_month, source, currency, amount FROM website_income;'), [
      { website_id: 1, income_month: '2026-09', source: 'AdSense', currency: 'USD', amount: 8.5 }
    ])
    assert.equal(store.sql('SELECT COUNT(*) AS count FROM adsense_income;')[0].count, 1)
    assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_resources WHERE website_id=1;')[0].count, 1)
    assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_operations WHERE website_id=1;')[0].count, 1)
    assert.equal(store.sql('SELECT COUNT(*) AS count FROM website_ai_notes WHERE website_id=1;')[0].count, 1)
    assert.deepEqual(store.sql('PRAGMA foreign_key_check;'), [])
    assert.throws(() => store.sql('DELETE FROM domains WHERE id=1;'), /Command failed/)
    assert.throws(() => store.sql('UPDATE domains SET website_id=NULL WHERE id=1;'), /Command failed/)
    store.sql('DELETE FROM websites WHERE id=1;')
    assert.equal(store.sql('SELECT COUNT(*) AS count FROM domains;')[0].count, 0)
  } finally { store.close() }
})
