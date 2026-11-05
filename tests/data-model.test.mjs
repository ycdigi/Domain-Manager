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
    assert.match(runSql(db, 'PRAGMA table_info(domains);'), /computer_name/)
    assert.match(runSql(db, 'PRAGMA table_info(adsense_accounts);'), /publisher_id/)
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('v1.8 migration adds an optional computer label without changing domain rows', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/computer-migration.db'
  try {
    const legacySchema = fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8').replace(/^\s*computer_name TEXT,\r?\n/m, '')
    runSql(db, legacySchema)
    runSql(db, "INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type) VALUES ('example.com', 'test', '2025-01-01', '2027-01-01', '正常网站');")
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.8.0.sql'), 'utf8'))
    assert.equal(runSql(db, 'SELECT computer_name FROM domains WHERE domain=\'example.com\';').trim(), '')
    runSql(db, "UPDATE domains SET computer_name='Mac Mini YC' WHERE domain='example.com';")
    assert.equal(runSql(db, 'SELECT computer_name FROM domains WHERE domain=\'example.com\';').trim(), 'Mac Mini YC')
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
  assert.match(home, /expiry_date.*到期日期/)
})

test('WordPress content counts are editable in the ledger and PATCH with their statistics date', () => {
  const patch = fs.readFileSync(path.join(repo, 'functions/api/domains/[id].ts'), 'utf8')
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  assert.match(home, /label="文章数量"[\s\S]*?label="计算器数量"[\s\S]*?label="类型"[\s\S]*?label="日点击"/)
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
  for (const prop of ['site_name', 'domain', 'industry', 'daily_clicks', 'platform', 'adsense_connected', 'expiry_date']) {
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

test('ledger uses search and platform tabs with WordPress-only counts', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  assert.match(fs.readFileSync(path.join(repo, 'src/layouts/WorkspaceLayout.vue'), 'utf8'), /platformTabs = .*全部.*Astro.*Next.js.*WordPress/)
  assert.match(home, /platformTab.value !== 'all' && row.platform !== platformTab.value/)
  assert.match(home, /v-if="platformTab === 'WordPress'" label="文章数量"/)
  assert.match(home, /label="电脑"/)
  assert.doesNotMatch(home, /v-model="(?:ownerFilter|seoFilter|resourceFilter)"/)
})

test('copy actions share the clipboard fallback and keep domain copy local', () => {
  const clipboard = fs.readFileSync(path.join(repo, 'src/utils/clipboard.ts'), 'utf8')
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const detail = fs.readFileSync(path.join(repo, 'src/components/DomainDetailDrawer.vue'), 'utf8')
  const resources = fs.readFileSync(path.join(repo, 'src/views/Resources.vue'), 'utf8')
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/)
  assert.match(clipboard, /document\.execCommand\('copy'\)/)
  assert.match(home, /DocumentCopy/)
  assert.match(home, /@click\.stop="copyDomain\(scope\.row\.domain\)"/)
  assert.match(home, /已复制域名：\$\{domain\}/)
  assert.match(detail, /copyText\(content\)/)
  assert.match(resources, /copyText\(revealedToken\.value\)/)
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
  const alertDialog = fs.readFileSync(path.join(repo, 'src/views/Notifications.vue'), 'utf8')
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const detail = fs.readFileSync(path.join(repo, 'src/components/DomainDetailDrawer.vue'), 'utf8')
  const resources = fs.readFileSync(path.join(repo, 'src/views/Resources.vue'), 'utf8')
  const adsense = fs.readFileSync(path.join(repo, 'src/views/Adsense.vue'), 'utf8')
  const quickField = fs.readFileSync(path.join(repo, 'src/components/QuickFieldDialog.vue'), 'utf8')
  const adsenseQuick = fs.readFileSync(path.join(repo, 'src/components/AdsenseQuickDialog.vue'), 'utf8')
  assert.match(domainDialog, /emit\('submit', payload\)\s*\}\) \}/)
  assert.doesNotMatch(domainDialog, /emit\('submit', payload\); dialogVisible\.value = false/)
  assert.doesNotMatch(alertDialog, /emit\('submit', form\.value\)\s*\n\s*dialogVisible\.value = false/)
  assert.match(alertDialog, /original\.value = JSON\.stringify\(form\.value\)/)
  assert.match(home, /overviewError/)
  assert.match(home, /loadOverview/)
  assert.match(detail, /Promise\.allSettled\(\[loadNotes\(\), loadOperations\(\)\]\)/)
  assert.match(detail, /detail-load-error/)
  assert.match(resources, /page-error/)
  assert.match(resources, /loadError\.value = e instanceof Error/)
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

test('legacy income writes still fall back to amount when the new USD field is zero', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/income-compat.db'
  try {
    runSql(db, fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8'))
    runSql(db, `INSERT INTO adsense_accounts(name, owner) VALUES ('main', 'self'); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5);`)
    const total = runSql(db, `SELECT SUM(CASE WHEN amount_usd = 0 AND amount <> 0 THEN amount ELSE amount_usd END) FROM adsense_income;`).trim()
    assert.equal(total, '12.5')
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
    for (const version of ['v1.1.0', 'v1.2.0', 'v1.3.0', 'v1.4.0', 'v1.5.0', 'v1.6.0', 'v1.7.0', 'v1.8.0', 'v1.9.0']) runSql(db, fs.readFileSync(path.join(repo, `schema-migration-${version}.sql`), 'utf8'))
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

test('workspace routes replace management dialogs without duplicating implementations', () => {
  const routes = fs.readFileSync(path.join(repo, 'src/router/index.ts'), 'utf8')
  for (const route of ['home', 'resources', 'adsense', 'settings/notifications', 'data']) assert.ok(routes.includes(`path: '${route}'`))
  for (const removed of ['AdsenseManagerDialog', 'ResourceManagerDialog', 'AlertConfigDialog', 'ImportDialog']) assert.equal(fs.existsSync(path.join(repo, `src/components/${removed}.vue`)), false)
  for (const page of ['Resources', 'Adsense', 'Notifications', 'DataManagement']) assert.doesNotMatch(fs.readFileSync(path.join(repo, `src/views/${page}.vue`), 'utf8'), /<el-dialog/)
})

test('session read cache deduplicates requests, invalidates dependencies and retries failures', async () => {
  const ts = await import('typescript')
  const source = fs.readFileSync(path.join(repo, 'src/utils/workspaceCache.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  let calls = 0, resolveRead, rejectRead
  const api = { get: () => { calls++; return new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject }) } }
  const exports = {}
  new Function('require', 'exports', code)(name => name === 'vue' ? { ref: value => ({ value }) } : { api }, exports)
  const one = exports.cachedGet('/api/domains'), two = exports.cachedGet('/api/domains')
  assert.equal(calls, 1)
  resolveRead([{ id: 1 }]); assert.deepEqual(await one, await two)
  await exports.cachedGet('/api/domains'); assert.equal(calls, 1)
  exports.invalidateData('/api/domains')
  const pending = exports.cachedGet('/api/domains'); rejectRead(new Error('offline')); await assert.rejects(pending, /offline/)
  const retry = exports.cachedGet('/api/domains'); resolveRead([{ id: 2 }]); assert.deepEqual(await retry, [{ id: 2 }])
  assert.equal(calls, 3)
  exports.clearWorkspaceCache(); const fresh = exports.cachedGet('/api/domains'); resolveRead([]); await fresh; assert.equal(calls, 4)
})

test('data freshness changes only when measured values change', async () => {
  const ts = await import('typescript')
  const code = ts.transpileModule(fs.readFileSync(path.join(repo, 'src/utils/dataFreshness.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}; new Function('exports', code)(exports)
  const today = '2026-11-05', previous = '2026-10-01'
  assert.equal(exports.clicksDate('30to49', '30to49', previous, today), previous)
  assert.equal(exports.clicksDate('50to99', '30to49', previous, today), today)
  assert.equal(exports.clicksDate(null, '30to49', previous, today), null)
  assert.equal(exports.contentDate(3, 5, 3, 5, previous, today), previous)
  assert.equal(exports.contentDate(4, 5, 3, 5, previous, today), today)
  assert.equal(exports.contentDate(null, null, 3, 5, previous, today), null)
})

test('SEO actions keep 15/16 and 30/31 day boundaries', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const body = home.slice(home.indexOf('const seoState ='), home.indexOf('const seoNeedsAttention')).split('=> {')[1].replace(/};\s*$/, '')
  const action = new Function('row', 'daysSince', body)
  assert.equal(action({ seo_last_date: null }, () => 0).actionable, true)
  for (const days of [0, 15, 16, 30, 31]) {
    const value = action({ domain: 'example.com', seo_last_date: '2026-10-01' }, () => days)
    assert.equal(value.actionable, days > 15)
    assert.equal(value.kind, days <= 15 ? 'recent' : days <= 30 ? 'stale' : 'overdue')
    assert.match(value.title, /example.com/)
  }
})

test('queue reports blocked writes, overlays local values and retries without losing edits', async () => {
  const ts = await import('typescript')
  const code = ts.transpileModule(fs.readFileSync(path.join(repo, 'src/utils/writeQueue.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  let failed = true, calls = 0; const storage = new Map(); const exports = {}
  class ApiError extends Error { status = 400 }
  const fakeWindow = { setTimeout: () => 1, clearTimeout: () => {}, addEventListener: () => {} }
  const request = { api: { post: async () => { calls++; if (failed) throw new ApiError('blocked') } }, ApiError }
  new Function('require','exports','window','localStorage', code)(name => name === 'vue' ? { ref: value => ({ value }), computed: getter => ({ get value() { return getter() } }) } : name === './auth' ? { useAuth: () => ({ getAuthToken: () => ({ token: 'fixture' }) }) } : name === './workspaceCache' ? { invalidateData: () => {} } : request, exports, fakeWindow, { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value) })
  const queue = exports.getWriteQueue()
  queue.enqueueMany([{ type:'domain_patch', id:1, fields:{ seo_last_date:'2026-11-05' } }, { type:'domain_operation_add', domain_id:1, operation_date:'2026-11-05', operation_kind:'SEO' }])
  assert.deepEqual(await queue.flush(), { pending:2, failed:2, synced:false })
  assert.equal(queue.applyPendingDomains([{ id:1, seo_last_date:null }])[0].seo_last_date, '2026-11-05')
  queue.enqueue({ type:'domain_patch', id:1, fields:{ daily_clicks_range:'50to99' } })
  assert.equal(queue.pending.value.length, 2)
  assert.equal(queue.applyPendingDomains([{ id:1 }])[0].daily_clicks_range, '50to99')
  failed = false
  assert.deepEqual(await queue.retryFailed(), { pending:0, failed:0, synced:true })
  assert.equal(calls, 2)
  assert.equal(queue.syncing.value, false)
})

test('domain expiry presentation and fixed type choices are explicit', () => {
  const home = fs.readFileSync(path.join(repo, 'src/views/Home.vue'), 'utf8')
  const css = fs.readFileSync(path.join(repo, 'src/styles/home/home.css'), 'utf8')
  const validation = fs.readFileSync(path.join(repo, 'functions/utils/domain-validation.ts'), 'utf8')
  const resources = fs.readFileSync(path.join(repo, 'src/views/Resources.vue'), 'utf8')
  assert.match(home, /prop="expiry_date" label="到期日期"/)
  assert.match(home, /row-expired/)
  assert.match(home, /row-expiring/)
  assert.match(css, /row-expired[^}]*background: color-mix/)
  assert.match(css, /row-expiring[^}]*background: color-mix/)
  assert.match(home, /const industryOptions = \['计算器', '资讯站', '其他'\]/)
  assert.doesNotMatch(home, /domains\.value\.map\(domain => domain\.industry\)/)
  assert.match(validation, /domainTypes = \['计算器', '资讯站', '其他'\]/)
  assert.match(validation, /网站类型只能是计算器、资讯站或其他/)
  assert.match(resources, /editor-provider-context/)
  assert.match(resources, /resource-account-grid/)
})

test('v1.9 migration adds monthly transfer metadata and optional site income breakdowns', () => {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-manager-')) + '/income-v19.db'
  try {
    runSql(db, `CREATE TABLE domains (id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL, registrar TEXT NOT NULL, registrar_date TEXT NOT NULL, expiry_date TEXT NOT NULL, service_type TEXT NOT NULL, adsense_account_id INTEGER);
      CREATE TABLE adsense_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, owner TEXT NOT NULL);
      CREATE TABLE adsense_income (id INTEGER PRIMARY KEY AUTOINCREMENT, adsense_account_id INTEGER NOT NULL, income_month TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, memo TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE (adsense_account_id, income_month), FOREIGN KEY (adsense_account_id) REFERENCES adsense_accounts(id));`)
    runSql(db, "INSERT INTO adsense_accounts(name, owner) VALUES ('main', 'self'); INSERT INTO domains(domain, registrar, registrar_date, expiry_date, service_type, adsense_account_id) VALUES ('one.example', 'test', '2025-01-01', '2027-01-01', '正常网站', 1); INSERT INTO adsense_income(adsense_account_id, income_month, amount) VALUES (1, '2026-10', 12.5);")
    runSql(db, fs.readFileSync(path.join(repo, 'schema-migration-v1.9.0.sql'), 'utf8'))
    const columns = runSql(db, 'PRAGMA table_info(adsense_income);')
    assert.match(columns, /amount_usd/)
    assert.match(columns, /amount_cny/)
    assert.match(columns, /transfer_date/)
    assert.equal(runSql(db, 'SELECT amount_usd FROM adsense_income WHERE id=1;').trim(), '12.5')
    assert.match(runSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='adsense_income_domains';"), /adsense_income_domains/)
    runSql(db, "INSERT INTO adsense_income_domains(income_id, domain_id, amount_usd) VALUES (1, 1, 6.25);")
    assert.equal(runSql(db, 'SELECT amount_usd FROM adsense_income_domains WHERE income_id=1;').trim(), '6.25')
  } finally {
    fs.rmSync(path.dirname(db), { recursive: true, force: true })
  }
})

test('AdSense page exposes USD/CNY transfer date and optional site breakdown', () => {
  const page = fs.readFileSync(path.join(repo, 'src/views/Adsense.vue'), 'utf8')
  const income = fs.readFileSync(path.join(repo, 'functions/api/adsense/income/index.ts'), 'utf8')
  assert.match(page, /美元金额（USD）/)
  assert.match(page, /人民币金额（CNY，可空）/)
  assert.match(page, /转账日期（可空）/)
  assert.match(page, /网站美元明细（可选）/)
  assert.match(page, /income-month-history/)
  assert.match(page, /monthOptions/)
  assert.match(page, /income-heading-month/)
  assert.match(page, /el-date-picker id="income-month"[^>]+type="month"[^>]+value-format="YYYY-MM"/)
  assert.doesNotMatch(page, /el-input id="income-month"/)
  assert.match(income, /adsense_income_domains/)
  assert.match(income, /amount_cny/)
  assert.match(income, /transfer_date/)
})
