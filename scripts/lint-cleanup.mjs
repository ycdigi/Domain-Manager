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
const source = sourceFiles.map(read).join('\n')

const assert = (condition, message) => { if (!condition) failures.push(message) }
assert(!source.includes('dm-home-route'), '旧 dm-home-route 作用域仍存在')
assert(!source.includes('/api/addrec') && !fs.existsSync(path.join(root, 'functions/api/addrec/index.ts')), '已删除的 /api/addrec 仍有引用')
assert(fs.existsSync(path.join(root, 'functions/api/check/index.ts')), '/api/check 路由缺失')
assert(fs.existsSync(path.join(root, 'functions/api/domains/export.ts')), 'JSON 备份接口缺失')
assert(!source.includes('style="width:100%"'), '仍存在可迁移的 width:100% 内联样式')
assert(!source.includes('<style scoped>'), '仍存在未外置的模板内联样式')

const cssFiles = sourceFiles.filter(file => file.endsWith('.css'))
const css = cssFiles.map(read).join('\n')
const classNames = new Set([...source.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/)))
const dynamicNames = ['expiry-warning', 'expiry-expired', 'status-online', 'status-offline']
dynamicNames.forEach(name => classNames.add(name))
for (const match of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    const name = match[1]
    if (/^(el-|is-|has-|deep$|dm-ui$)/.test(name) || name === 'home-container') continue
    assert(classNames.has(name) || source.includes(name), `CSS 类没有模板或运行时来源: .${name}`)
}

const tokenDefinitions = new Map()
for (const match of read('src/styles/shared/tokens.css').matchAll(/(--[\w-]+)\s*:/g)) {
    tokenDefinitions.set(match[1], (tokenDefinitions.get(match[1]) || 0) + 1)
}
for (const [token, count] of tokenDefinitions) assert(count === 1, `共享 token 重复定义: ${token}`)

const queue = read('src/utils/writeQueue.ts')
const batch = read('functions/api/domains/batch/index.ts')
for (const field of ['last_status_check_at', 'daily_clicks', 'clicks_updated_date', 'seo_last_date']) {
    assert(queue.includes(field) && batch.includes(field), `队列与批量 API 未同时支持字段: ${field}`)
}
assert(queue.includes('domain_operation_add') && batch.includes('domain_operation_add'), '操作日期队列或批量 API缺失')

if (failures.length) {
    console.error(failures.map(item => `- ${item}`).join('\n'))
    process.exit(1)
}
console.log(`cleanup audit passed: ${sourceFiles.length} source files, ${cssFiles.length} CSS files`)
