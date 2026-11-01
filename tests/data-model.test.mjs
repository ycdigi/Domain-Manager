import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runSql = (db, sql) => execFileSync('sqlite3', [db], { input: sql, encoding: 'utf8' })

test('schema is repeatable and includes resource tables', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/schema.db'
  try {
    const schema = fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8')
    runSql(db, schema)
    runSql(db, schema)
    const tables = runSql(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").trim().split('\n')
    assert.ok(tables.includes('provider_accounts'))
    assert.ok(tables.includes('provider_resources'))
    assert.ok(tables.includes('domain_resources'))
    assert.ok(tables.includes('provider_credentials'))
    assert.ok(tables.includes('domain_ai_notes'))
    assert.ok(tables.includes('domain_ai_note_versions'))
    assert.ok(tables.includes('domain_operations'))
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /platform/)
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /daily_clicks_range/)
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /site_name/)
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /industry/)
    assert.match(runSql(db, 'PRAGMA table_info(adsense_accounts);'), /publisher_id/)
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('dashboard and domain lookups use their supporting indexes', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/query-plan.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    const seoPlan = runSql(db, 'EXPLAIN QUERY PLAN SELECT id, domain, seo_last_date FROM domains ORDER BY seo_last_date ASC LIMIT 5;')
    const linksPlan = runSql(db, 'EXPLAIN QUERY PLAN SELECT COUNT(*) FROM domain_resources WHERE domain_id=1;')
    const domainPlan = runSql(db, "EXPLAIN QUERY PLAN SELECT id FROM domains WHERE lower(rtrim(domain, '.'))='example.com';")
    const operationsPlan = runSql(db, "EXPLAIN QUERY PLAN SELECT operation_date FROM domain_operations WHERE domain_id=1 ORDER BY operation_date DESC;")
    assert.match(seoPlan, /idx_domains_seo_last_date/)
    assert.match(linksPlan, /sqlite_autoindex_domain_resources_1/)
    assert.match(domainPlan, /uq_domains_normalized_name/)
    assert.match(operationsPlan, /idx_domain_operations_domain_date/)
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('resource link triggers keep derived domain status accurate', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/links.db'
  try {
    runSql(db, 'PRAGMA foreign_keys=ON;')
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com', 'test', '2025-01-01', '2027-01-01', '正常网站'); INSERT INTO provider_accounts(provider, name) VALUES ('github', 'source'); INSERT INTO provider_resources(account_id, provider, name) VALUES (1, 'github', 'repo'); INSERT INTO domain_resources(domain_id, resource_id, role) VALUES (1, 1, '代码仓库');`)
    assert.equal(runSql(db, 'SELECT resource_status FROM domains WHERE id=1;').trim(), '已关联')
    runSql(db, 'DELETE FROM domain_resources WHERE id=1;')
    assert.equal(runSql(db, 'SELECT resource_status FROM domains WHERE id=1;').trim(), '未关联')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('AI notes keep current records and version history, and domain deletion cascades', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/ai-notes.db'
  try {
    runSql(db, 'PRAGMA foreign_keys=ON;')
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com', 'test', '2025-01-01', '2027-01-01', '正常网站'); INSERT INTO domain_ai_notes(domain_id, kind, content) VALUES (1, 'AI提示词', '检查入口页'); INSERT INTO domain_ai_note_versions(note_id, kind, content, version_no) VALUES (1, 'AI提示词', '检查入口页', 1); UPDATE domain_ai_notes SET content='检查入口页和内链', updated_at=CURRENT_TIMESTAMP WHERE id=1; INSERT INTO domain_ai_note_versions(note_id, kind, content, version_no) VALUES (1, 'AI提示词', '检查入口页和内链', 2);`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_notes WHERE archived_at IS NULL;').trim(), '1')
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_note_versions WHERE note_id=1;').trim(), '2')
    runSql(db, 'DELETE FROM domains WHERE id=1;')
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_notes;').trim(), '0')
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_ai_note_versions;').trim(), '0')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('income is unique per AdSense account and month', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/income.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner) VALUES ('main', 'self'); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5);`)
    runSql(db, `INSERT OR IGNORE INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 2);`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM adsense_income;').trim(), '1')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('AdSense Publisher IDs are unique when present', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/publisher.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner, publisher_id) VALUES ('main', 'self', 'pub-12345678'); INSERT OR IGNORE INTO adsense_accounts(name, owner, publisher_id) VALUES ('duplicate', 'self', 'pub-12345678');`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM adsense_accounts;').trim(), '1')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('export snapshot source does not query credential storage', () => {
  const source = fs.readFileSync(path.join(repo, 'functions/api/export/snapshot/index.ts'), 'utf8')
  assert.doesNotMatch(source, /provider_credentials|ciphertext|CREDENTIAL_ENCRYPTION_KEY|TELEGRAM_BOT_TOKEN|API_TOKEN/)
})

test('AI sync endpoint only exposes operational fields and does not query credentials', () => {
  const source = fs.readFileSync(path.join(repo, 'functions/api/ai/sync/index.ts'), 'utf8')
  assert.match(source, /checkApiToken/)
  assert.match(source, /onRequestGet[\s\S]*405/)
  assert.match(source, /domain_ai_notes/)
  assert.match(source, /domain_operations/)
  assert.doesNotMatch(source, /provider_credentials|ciphertext|CREDENTIAL_ENCRYPTION_KEY|TELEGRAM_BOT_TOKEN/)
})

test('AI sync prompt uses fixed industries and only sends changed fields', () => {
  const prompt = fs.readFileSync(path.join(repo, 'AI-SYNC-PROMPT.md'), 'utf8')
  const dialog = fs.readFileSync(path.join(repo, 'src/components/DomainDialog.vue'), 'utf8')
  const enrich = fs.readFileSync(path.join(repo, 'scripts/enrich-domains.mjs'), 'utf8')
  assert.match(prompt, /计算器.*资讯站.*其他/)
  assert.match(prompt, /后续维护只提交本次新增、修改或明确要求重写的字段/)
  assert.match(prompt, /registrar.*registrar_link.*registrar_date.*expiry_date.*service_type/)
  assert.match(prompt, /由调用环境注入为 `API_TOKEN`/)
  assert.doesNotMatch(prompt, /65379f99f51befdf5cc3251e96ad8349410bbb263b4d3b5da239f95813746762/)
  assert.doesNotMatch(dialog, /allow-create/)
  assert.match(enrich, /\['计算器'/)
  assert.match(enrich, /\['资讯站'/)
  assert.match(enrich, /top\?\.\[1\] >= 1 \? top\[0\] : null/)
})

test('legacy addrec endpoint is removed while supported endpoints remain', () => {
  assert.equal(fs.existsSync(path.join(repo, 'functions/api/addrec/index.ts')), false)
  assert.equal(fs.existsSync(path.join(repo, 'functions/api/check/index.ts')), true)
  assert.equal(fs.existsSync(path.join(repo, 'functions/api/domains/export.ts')), true)
})

test('write queue and batch API share the operation-date contract', () => {
  const queue = fs.readFileSync(path.join(repo, 'src/utils/writeQueue.ts'), 'utf8')
  const batch = fs.readFileSync(path.join(repo, 'functions/api/domains/batch/index.ts'), 'utf8')
  assert.match(queue, /domain_operation_add/)
  assert.match(batch, /domain_operation_add/)
  assert.match(queue, /operation_date/)
  assert.match(batch, /operation_kind/)
})

test('domain quick editing exposes a narrow PATCH contract and SEO dual write', () => {
  const patch = fs.readFileSync(path.join(repo, 'functions/api/domains/[id].ts'), 'utf8')
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const request = fs.readFileSync(path.join(repo, 'src/utils/request.ts'), 'utf8')
  assert.match(patch, /onRequestPatch/)
  assert.match(patch, /site_name.*industry.*status.*platform.*platform_other.*adsense_connected.*adsense_account_id.*adsense_opened_date/)
  assert.match(request, /patch: <T = unknown>/)
  assert.match(home, /domain_operation_add/)
  assert.match(home, /seo_last_date: date/)
  assert.match(home, /sidebar-collapsed/)
  assert.match(home, /handleAdsenseSelect/)
  assert.match(home, /registrar_date.*注册时间/)
})

test('WordPress content counts are editable in the ledger and PATCH with their statistics date', () => {
  const patch = fs.readFileSync(path.join(repo, 'functions/api/domains/[id].ts'), 'utf8')
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  assert.match(home, /label="日点击"[\s\S]*?label="计算器数"[\s\S]*?label="文章数"/)
  assert.match(home, /handleWordPressCount\(scope\.row, 'wp_calculator_count', value\)/)
  assert.match(home, /handleWordPressCount\(scope\.row, 'wp_article_count', value\)/)
  assert.match(home, /content_stats_updated_date: nextDate/)
  assert.match(home, /field === 'platform' && value !== 'WordPress'[\s\S]*?fields\.wp_calculator_count = null[\s\S]*?fields\.wp_article_count = null[\s\S]*?fields\.content_stats_updated_date = null/)
  assert.match(patch, /wp_calculator_count.*wp_article_count.*content_stats_updated_date/)
  assert.match(patch, /Number\.isInteger\(fields\[field\]\)/)
  assert.match(patch, /isValidDate\(fields\.content_stats_updated_date\)/)
})

test('domain table sorting is persisted and reapplied after data changes', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  assert.match(home, /domain-manager\.table-sort/)
  assert.match(home, /tableRef = ref<TableInstance>/)
  assert.match(home, /@sort-change="handleTableSortChange"/)
  assert.match(home, /tableRef\.value\.sort\(tableSort\.value\.prop, tableSort\.value\.order\)/)
  assert.match(home, /saveTableSort\(\{ \.\.\.defaultTableSort \}\);\s*void applyTableSort\(\)/)
  assert.match(home, /watch\(filteredDomains/)
  assert.doesNotMatch(home, /:default-sort=/)
  for (const prop of ['site_name', 'domain', 'industry', 'daily_clicks', 'platform', 'adsense_connected', 'latest_operation_date', 'registrar_date', 'expiry_date', 'status']) {
    assert.match(home, new RegExp(`sortableTableProps.*${prop}`))
  }
})

test('site name displays a warning marker for never-optimized and over-30-day SEO', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const css = fs.readFileSync(path.join(repo, 'src/styles/home/home.css'), 'utf8')
  assert.match(home, /WarningFilled/)
  assert.match(home, /seoNeedsAttention\(scope\.row\)/)
  assert.match(home, /\['never', 'overdue'\]\.includes\(seoState\(row\)\.kind\)/)
  assert.match(css, /\.site-seo-alert[^}]*color:var\(--color-error\)/)
  assert.match(home, /:row-class-name="tableRowClassName"/)
  assert.match(css, /row-seo-attention[^}]*background: var\(--color-paper-2\)/)
})

test('site name star marks an operation in the last seven days', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const css = fs.readFileSync(path.join(repo, 'src/styles/home/home.css'), 'utf8')
  assert.match(home, /StarFilled/)
  assert.match(home, /hasRecentOperation\(scope\.row\)/)
  assert.match(home, /latest_operation_date <= localDate\(\) && daysSince\(row\.latest_operation_date\) <= 7/)
  assert.match(css, /\.site-recent-star[^}]*color:var\(--color-link\)/)
  assert.match(css, /row-recent-operation[^}]*background: var\(--color-success-paper\)/)
})

test('table keeps the header visible and sorts recent operations as dates', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const css = fs.readFileSync(path.join(repo, 'src/styles/home/home.css'), 'utf8')
  assert.match(home, /label="最近操作"[\s\S]*?:sort-method="compareOperationDates"/)
  assert.match(home, /const compareOperationDates = \(a: DomainData, b: DomainData\)/)
  assert.match(home, /if \(!aDate\) return 1/)
  assert.match(css, /\.custom-table \.el-table__header-wrapper \{ position: sticky; top: 0;/)
})

test('copy actions share the clipboard fallback and keep domain copy local', () => {
  const clipboard = fs.readFileSync(path.join(repo, 'src/utils/clipboard.ts'), 'utf8')
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const detail = fs.readFileSync(path.join(repo, 'src/components/DomainDetailDrawer.vue'), 'utf8')
  const resources = fs.readFileSync(path.join(repo, 'src/components/ResourceManagerDialog.vue'), 'utf8')
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/)
  assert.match(clipboard, /document\.execCommand\('copy'\)/)
  assert.match(home, /DocumentCopy/)
  assert.match(home, /@click\.stop="copyDomain\(scope\.row\.domain\)"/)
  assert.match(home, /已复制域名：\$\{domain\}/)
  assert.match(detail, /copyText\(content\)/)
  assert.match(resources, /copyText\(result\.token\)/)
  assert.doesNotMatch([home, detail, resources].join('\n'), /navigator\.clipboard/)
})

test('domain detail drawer is compact and reuses the full edit flow', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const detail = fs.readFileSync(path.join(repo, 'src/components/DomainDetailDrawer.vue'), 'utf8')
  const style = fs.readFileSync(path.join(repo, 'src/styles/dialogs/domain-detail.css'), 'utf8')
  assert.match(detail, /detail-drawer-header/)
  assert.match(detail, /编辑域名信息/)
  assert.match(detail, /event: 'edit'/)
  assert.match(home, /@edit="handleDetailEdit"/)
  assert.match(home, /detailVisible\.value = false; handleEdit\(row\)/)
  assert.match(style, /el-drawer__body.*padding/)
  assert.match(style, /detail-grid div.*border-bottom/)
})

test('form and detail loading states remain recoverable after request failures', () => {
  const domainDialog = fs.readFileSync(path.join(repo, 'src/components/DomainDialog.vue'), 'utf8')
  const alertDialog = fs.readFileSync(path.join(repo, 'src/components/AlertConfigDialog.vue'), 'utf8')
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const detail = fs.readFileSync(path.join(repo, 'src/components/DomainDetailDrawer.vue'), 'utf8')
  const resources = fs.readFileSync(path.join(repo, 'src/components/ResourceManagerDialog.vue'), 'utf8')
  const adsense = fs.readFileSync(path.join(repo, 'src/components/AdsenseManagerDialog.vue'), 'utf8')
  const quickField = fs.readFileSync(path.join(repo, 'src/components/QuickFieldDialog.vue'), 'utf8')
  const adsenseQuick = fs.readFileSync(path.join(repo, 'src/components/AdsenseQuickDialog.vue'), 'utf8')
  assert.match(domainDialog, /emit\('submit', payload\)\s*\}\) \}/)
  assert.doesNotMatch(domainDialog, /emit\('submit', payload\); dialogVisible\.value = false/)
  assert.doesNotMatch(alertDialog, /emit\('submit', form\.value\)\s*\n\s*dialogVisible\.value = false/)
  assert.match(home, /configVisible\.value = false/)
  assert.match(home, /overviewError/)
  assert.match(home, /loadOverview/)
  assert.match(detail, /Promise\.allSettled\(\[loadNotes\(\), loadOperations\(\)\]\)/)
  assert.match(detail, /detail-load-error/)
  assert.match(resources, /resource-load-error/)
  assert.match(resources, /loadError\.value = error instanceof Error/)
  assert.match(adsense, /incomeRows\.value = \[\]/)
  assert.match(adsense, /incomeError/)
  assert.doesNotMatch(quickField, /emit\('save'.*dialogVisible\.value = false/)
  assert.doesNotMatch(adsenseQuick, /emit\('save'.*dialogVisible\.value = false/)
  assert.match(home, /quickFieldVisible\.value = false; await applyTableSort/)
  assert.match(home, /adsenseQuickVisible\.value = false;/)
})

test('dashboard operating metrics use explicit date and click boundaries', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/metrics.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type, platform, daily_clicks, seo_last_date) VALUES
      ('today.example', 'r', '2025-01-01', '2026-10-31', '正常网站', 'WordPress', 30, '2026-10-01'),
      ('thirty.example', 'r', '2025-01-01', '2026-11-30', '正常网站', 'Astro', 29, '2026-09-30'),
      ('later.example', 'r', '2025-01-01', '2026-12-01', '正常网站', 'Next.js', 31, '2026-09-29'),
      ('expired.example', 'r', '2025-01-01', '2026-10-30', '正常网站', 'WordPress', NULL, NULL);`)
    const row = runSql(db, `SELECT
      SUM(CASE WHEN expiry_date >= '2026-10-31' AND expiry_date <= date('2026-10-31', '+30 day') THEN 1 ELSE 0 END),
      SUM(CASE WHEN seo_last_date IS NULL OR julianday('2026-10-31') - julianday(seo_last_date) > 30 THEN 1 ELSE 0 END),
      SUM(CASE WHEN platform = 'WordPress' AND daily_clicks >= 30 THEN 1 ELSE 0 END),
      SUM(CASE WHEN platform = 'Astro' AND daily_clicks >= 30 THEN 1 ELSE 0 END),
      SUM(CASE WHEN platform = 'Next.js' AND daily_clicks >= 30 THEN 1 ELSE 0 END)
      FROM domains;`).trim()
    assert.equal(row, '2|3|1|0|1')
    const summary = fs.readFileSync(path.join(repo, 'functions/api/dashboard/summary/index.ts'), 'utf8')
    assert.match(summary, /seo_stale_domains/)
    assert.match(summary, /excellent_wordpress/)
    assert.match(summary, /expiry_date >= \?/)
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('confirmation feedback is centralized and localized', () => {
  const feedback = fs.readFileSync(path.join(repo, 'src/utils/feedback.ts'), 'utf8')
  assert.match(feedback, /confirmButtonText: '确定'/)
  assert.match(feedback, /cancelButtonText: '取消'/)
  const sourceFiles = []
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(relative)
      else if (/\.(vue|ts)$/.test(entry.name)) sourceFiles.push(relative)
    }
  }
  walk('src')
  const source = sourceFiles.map(file => fs.readFileSync(path.join(repo, file), 'utf8')).join('\n')
  assert.doesNotMatch(source.replace(feedback, ''), /ElMessageBox\.confirm/)
})

test('dashboard income remains one account-month total when it has multiple sites', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/dashboard.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner) VALUES ('main', 'self'); INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type, adsense_account_id) VALUES ('one.example', 'r', '2025-01-01', '2027-01-01', 'normal', 1), ('two.example', 'r', '2025-01-01', '2027-01-01', 'normal', 1); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5);`)
    const row = runSql(db, `SELECT COALESCE((SELECT SUM(i.amount) FROM adsense_income i WHERE i.adsense_account_id=a.id AND i.income_month='2026-10'),0) || '|' || (SELECT COUNT(DISTINCT d.id) FROM domains d WHERE d.adsense_account_id=a.id) FROM adsense_accounts a;`).trim()
    assert.equal(row, '12.5|2')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('income can be totaled by owner and currency across multiple accounts', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/owner-income.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner, currency) VALUES ('main', 'self', 'USD'), ('second', 'self', 'USD'), ('euro', 'self', 'EUR'); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5), (2, '2026-10', 7.5), (3, '2026-10', 3);`)
    const result = runSql(db, `SELECT owner || '|' || currency || '|' || SUM(i.amount) FROM adsense_accounts a LEFT JOIN adsense_income i ON i.adsense_account_id=a.id AND i.income_month='2026-10' GROUP BY owner, currency ORDER BY currency;`).trim().split('\n')
    assert.deepEqual(result, ['self|EUR|3.0', 'self|USD|20.0'])
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('operation dates are unique per domain, date and kind, and cascade on deletion', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/operations.db'
  try {
    runSql(db, 'PRAGMA foreign_keys=ON;')
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com', 'test', '2025-01-01', '2027-01-01', '正常网站'); INSERT INTO domain_operations(domain_id, operation_date, operation_kind) VALUES (1, '2026-10-31', 'SEO'); INSERT OR IGNORE INTO domain_operations(domain_id, operation_date, operation_kind) VALUES (1, '2026-10-31', 'SEO'); INSERT INTO domain_operations(domain_id, operation_date, operation_kind) VALUES (1, '2026-10-31', '内容');`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_operations;').trim(), '2')
    runSql(db, 'DELETE FROM domains WHERE id=1;')
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_operations;').trim(), '0')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('v1.6 migration preserves legacy domains and adds site identity fields', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/migration-v15.db'
  try {
    runSql(db, `CREATE TABLE domains (id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL, registrar TEXT NOT NULL, registrar_link TEXT, registrar_date TEXT NOT NULL, expiry_date TEXT NOT NULL, service_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT '离线', tgsend INTEGER DEFAULT 0, st_tgsend INTEGER DEFAULT 1, memo TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP); INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('legacy.example.com', 'test', '2025-01-01', '2026-12-31', '正常网站');`)
    for (const version of ['v1.1.0', 'v1.2.0', 'v1.3.0', 'v1.4.0', 'v1.5.0', 'v1.6.0', 'v1.7.0']) runSql(db, fs.readFileSync(path.join(repo, `schema-migration-${version}.sql`), 'utf8'))
    const row = runSql(db, "SELECT domain || '|' || platform FROM domains;").trim()
    assert.equal(row, 'legacy.example.com|其他')
    assert.match(runSql(db, 'PRAGMA table_info(adsense_accounts);'), /publisher_id/)
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /site_name/)
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /industry/)
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /daily_clicks_range/)
    assert.match(runSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='domain_operations';"), /domain_operations/)
    runSql(db, "INSERT INTO domain_operations(domain_id, operation_date, operation_kind) VALUES (1, '2026-10-31', '技术');")
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domain_operations;').trim(), '1')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('normalized domains are unique across case and trailing dots', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/domain-unique.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('Example.com', 'test', '2025-01-01', '2027-01-01', '正常网站'); INSERT OR IGNORE INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com.', 'test', '2025-01-01', '2027-01-01', '正常网站');`)
    assert.equal(runSql(db, 'SELECT COUNT(*) FROM domains;').trim(), '1')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('v1.1 through v1.3 migrations preserve existing domains', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/migration.db'
  try {
    runSql(db, `CREATE TABLE domains (id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL, registrar TEXT NOT NULL, registrar_link TEXT, registrar_date TEXT NOT NULL, expiry_date TEXT NOT NULL, service_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT '离线', tgsend INTEGER DEFAULT 0, st_tgsend INTEGER DEFAULT 1, memo TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP); INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('legacy.example.com', 'test', '2025-01-01', '2026-12-31', '正常网站');`)
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.1.0.sql'), 'utf8'))
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.2.0.sql'), 'utf8'))
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.3.0.sql'), 'utf8'))
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.4.0.sql'), 'utf8'))
    const row = runSql(db, "SELECT domain || '|' || adsense_connected || '|' || resource_status FROM domains;").trim()
    assert.equal(row, 'legacy.example.com|未知|未关联')
    const alertColumns = runSql(db, 'PRAGMA table_info(domains);')
    assert.match(alertColumns, /last_expiry_alert_date/)
    assert.match(alertColumns, /last_offline_alert_at/)
    const aiTables = runSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'domain_ai_note%';")
    assert.match(aiTables, /domain_ai_notes/)
    assert.match(aiTables, /domain_ai_note_versions/)
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})
