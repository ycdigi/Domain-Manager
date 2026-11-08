import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const failures = []
const sourceFiles = []
const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const relative = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(relative)
        else if (/\.(vue|ts|css|mjs)$/.test(entry.name)) sourceFiles.push(relative)
    }
}
walk('src'); walk('functions')
const appFiles = sourceFiles.filter(file => !file.endsWith('.css'))
const source = sourceFiles.map(read).join('\n')
const appSource = appFiles.map(read).join('\n')

const assert = (condition, message) => { if (!condition) failures.push(message) }
assert(!source.includes('dm-home-route'), '旧 dm-home-route 作用域仍存在')
assert(!source.includes('/api/addrec') && !fs.existsSync(path.join(root, 'functions/api/addrec/index.ts')), '已删除的 /api/addrec 仍有引用')
assert(fs.existsSync(path.join(root, 'functions/api/domains/check.ts')), '域名状态检查路由缺失')
assert(!fs.existsSync(path.join(root, 'functions/api/check/index.ts')), '已移除的 Telegram 检查路由仍存在')
assert(fs.existsSync(path.join(root, 'functions/api/domains/export.ts')), 'JSON 备份接口缺失')
assert(fs.existsSync(path.join(root, 'functions/api/websites/index.ts')), '网站组合 API 缺失')
assert(fs.existsSync(path.join(root, 'functions/api/websites/[id]/tasks/index.ts')), '逐站任务 API 缺失')
assert(fs.existsSync(path.join(root, 'functions/api/websites/[id]/operations/index.ts')), '网站操作记录 API 缺失')
assert(fs.existsSync(path.join(root, 'src/views/Domains.vue')), '域名资产视图缺失')
for (const file of ['src/components/DomainDetailDrawer.vue', 'src/components/DomainDialog.vue', 'functions/api/domains/[id]/todos/index.ts', 'functions/api/domains/[id]/todos/[todo_id]/index.ts']) assert(!fs.existsSync(path.join(root, file)), `旧域名功能入口仍存在: ${file}`)
for (const table of ['domain_resources', 'domain_todos', 'domain_operations', 'adsense_income_domains']) assert(!source.includes(table), `运行代码仍引用已迁移数据表: ${table}`)
for (const table of ['websites', 'domains', 'website_income', 'website_effort', 'website_tasks', 'website_click_snapshots', 'website_resources', 'website_operations', 'website_ai_notes']) assert(read('schema.sql').includes(`CREATE TABLE IF NOT EXISTS ${table}`), `网站模型缺表: ${table}`)
for (const table of ['link_sources', 'link_source_reviews', 'link_source_review_runs', 'website_link_opportunities', 'link_attempts']) assert(!read('schema.sql').includes(`CREATE TABLE IF NOT EXISTS ${table}`), `已移除的外链表仍在新库 schema 中: ${table}`)
for (const file of ['src/views/LinkSources.vue', 'src/api/link-sources.ts', 'src/styles/link-sources/link-sources.css', 'shared/link-sources.ts', 'functions/domain/link-sources.ts', 'functions/api/link-sources/index.ts', 'functions/api/link-sources/[id]/index.ts', 'functions/api/link-sources/import/index.ts', 'functions/api/link-sources/review/index.ts', 'functions/api/websites/[id]/link-opportunities/index.ts', 'functions/api/websites/[id]/link-opportunities/[opportunity_id]/index.ts', 'functions/api/websites/[id]/link-opportunities/[opportunity_id]/attempts/index.ts', 'scripts/link-source-review-agent.mjs', 'scripts/link-source-review-worker.mjs']) assert(!fs.existsSync(path.join(root, file)), `已移除的外链功能文件仍存在: ${file}`)
for (const route of ['/api/link-sources', '/link-opportunities', 'link_updates', 'link_opportunities', 'link_summary', 'dm_target_url']) assert(!appSource.includes(route), `运行代码仍引用已移除的外链入口: ${route}`)
assert(!source.includes('style="width:100%"'), '仍存在可迁移的 width:100% 内联样式')
assert(!source.includes('<style scoped>'), '仍存在未外置的模板内联样式')

const cssFiles = sourceFiles.filter(file => file.endsWith('.css'))
const css = cssFiles.map(read).join('\n')
const classNames = new Set()
for (const match of appSource.matchAll(/(?:class|className)\s*=\s*(["'`])([^"'`]+)\1/g)) match[2].split(/\s+/).forEach(name => classNames.add(name))
for (const match of read('index.html').matchAll(/(?:class|className)\s*=\s*(["'`])([^"'`]+)\1/g)) match[2].split(/\s+/).forEach(name => classNames.add(name))
for (const match of appSource.matchAll(/["']([A-Za-z_][\w-]*)["']\s*:/g)) classNames.add(match[1])
for (const match of appSource.matchAll(/classList\.(?:add|remove|toggle)\([^)]*?["']([A-Za-z_][\w-]*)["']/g)) classNames.add(match[1])
for (const match of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    const name = match[1]
    if (/^(el-|is-|has-|deep$|global$|slotted$)/.test(name)) continue
    assert(classNames.has(name) || appSource.includes(name), `CSS 类没有模板或运行时来源: .${name}`)
}

const tokenDefinitions = new Map()
for (const match of read('src/styles/shared/tokens.css').matchAll(/(--[\w-]+)\s*:/g)) {
    tokenDefinitions.set(match[1], (tokenDefinitions.get(match[1]) || 0) + 1)
}
for (const [token, count] of tokenDefinitions) assert(count === 1, `共享 token 重复定义: ${token}`)

const queue = read('src/utils/writeQueue.ts')
const batch = read('functions/api/domains/batch/index.ts')
for (const field of ['status', 'last_status_check_at']) assert(queue.includes(field) && batch.includes(field), `队列与批量 API 未同时支持字段: ${field}`)
assert(!queue.includes('domain_operation_add') && !queue.includes('resource_link_add'), '已替代的批量写入仍留在本机队列')
const domainSchema = read('schema.sql').match(/CREATE TABLE IF NOT EXISTS domains \(([\s\S]*?)\n\);/)?.[1] || ''
assert(domainSchema && !/site_name|ownership|industry|platform|adsense_connected|daily_clicks/.test(domainSchema), '域名表仍保存网站经营字段')
assert(read('AI-SYNC-PROMPT.md').includes('手动提交这段提示词') && read('AI-SYNC-PROMPT.md').includes('website_id'), 'AI 提示词未使用手动触发和稳定网站 ID')

if (failures.length) {
    console.error(failures.map(item => `- ${item}`).join('\n'))
    process.exit(1)
}
console.log(`cleanup audit passed: ${sourceFiles.length} source files, ${cssFiles.length} CSS files`)
