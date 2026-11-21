import { backupColumns, backupFormatVersion } from '../../../shared/backup-format'
import { resourceSupportsRole } from '../../../shared/resource-roles'
import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'
import { validateWebsiteFields } from '../../domain/website-validation'
import { validateMonitorPatch } from '../../domain/monitor'
import { validateManagementBackup } from '../../domain/website-management'
import { validateBatchFields } from '../../domain/batches'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const websiteColumns = ['name', 'stage', 'lifecycle', 'ownership', 'industry', 'platform', 'platform_other', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'gsc_connected', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'calculator_count', 'article_count', 'computer_name', 'content_stats_updated_date', 'potential', 'priority_order', 'next_action', 'next_action_due_date', 'next_action_status', 'new_site_override', 'page_count', 'created_at']
const domainColumns = ['domain', 'registrar', 'registrar_link', 'registrar_date', 'expiry_date', 'service_type', 'domain_role', 'is_primary', 'status', 'memo', 'last_status_check_at', 'created_at']
type Row = Record<string, any>

const monitoringTables = ['website_monitors', 'website_monitor_checks', 'website_monitor_incidents'] as const
const positiveId = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0
const timestamp = (value: unknown) => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
const text = (value: unknown, limit: number) => typeof value === 'string' && value.length <= limit
const optionalText = (value: unknown, limit: number) => value == null || text(value, limit)
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0

// Stored JSON columns remain strings in the versioned database snapshot.
const monitorRules = (value: unknown) => JSON.parse(value as string)
const validateMonitoring = (input: Row, websites: Row[], domains: Row[]) => {
    const errors: Array<{ domain: string; error: string }> = []
    const siteIds = new Set(websites.map(site => site.id))
    for (const table of monitoringTables) {
        const rows = input[table]
        if (rows === undefined) continue
        const limit = table === 'website_monitors' ? 500 : 50000
        if (!Array.isArray(rows) || rows.length > limit) {
            errors.push({ domain: table, error: `记录必须为数组且最多 ${limit} 条` }); continue
        }
        const ids = new Set<number>(); const openSites = new Set<number>()
        for (const row of rows) {
            let valid = row && typeof row === 'object' && !Array.isArray(row) && positiveId(row.website_id) && siteIds.has(row.website_id)
            if (valid) {
                const id = table === 'website_monitors' ? row.website_id : row.id
                valid = positiveId(id) && !ids.has(id); ids.add(id)
                if (table === 'website_monitors') {
                    try {
                        const enabled = row.enabled === undefined ? 1 : row.enabled
                        const config = { enabled: enabled === 1 ? true : enabled === 0 ? false : enabled,
                            allowed_redirect_hosts: monitorRules(row.allowed_redirect_hosts === undefined ? '[]' : row.allowed_redirect_hosts) }
                        valid = valid && (row.allowed_redirect_hosts === undefined || typeof row.allowed_redirect_hosts === 'string') && !validateMonitorPatch(config)
                    } catch { valid = false }
                    valid = valid && (row.domain_id == null ? row.domain == null : positiveId(row.domain_id) && text(row.domain, 253) && domains.some(domain => domain.id === row.domain_id && domain.website_id === row.website_id))
                    valid = valid && (row.status === undefined || ['healthy', 'pending', 'failure', 'unchecked'].includes(row.status))
                    valid = valid && optionalText(row.reason, 1000) && optionalText(row.final_url, 8192) && optionalText(row.title, 1000)
                    valid = valid && (row.checked_at == null || timestamp(row.checked_at))
                    for (const key of ['consecutive_failures', 'config_version']) valid = valid && (row[key] === undefined || Number.isSafeInteger(row[key]) && row[key] >= 0)
                } else {
                    valid = valid && text(row.domain, 253) && Boolean(row.domain) && text(row.reason, 1000)
                    if (table === 'website_monitor_checks') {
                        valid = valid && timestamp(row.checked_at) && ['healthy', 'failure'].includes(row.outcome)
                        valid = valid && nonnegative(row.response_ms) && text(row.final_url, 8192) && optionalText(row.title, 1000)
                    } else {
                        valid = valid && timestamp(row.opened_at) && timestamp(row.last_seen_at)
                        valid = valid && (row.resolved_at == null || timestamp(row.resolved_at)) && (row.read_at == null || timestamp(row.read_at))
                        valid = valid && Date.parse(row.last_seen_at) >= Date.parse(row.opened_at)
                        valid = valid && (row.resolved_at == null || Date.parse(row.resolved_at) >= Date.parse(row.opened_at))
                        if (row.resolved_at == null) { valid = valid && !openSites.has(row.website_id); openSites.add(row.website_id) }
                    }
                }
                if (table !== 'website_monitor_incidents') {
                    valid = valid && (row.http_status == null || Number.isInteger(row.http_status) && row.http_status >= 100 && row.http_status <= 599)
                    valid = valid && (row.response_ms == null && table === 'website_monitors' || nonnegative(row.response_ms))
                }
            }
            if (!valid) errors.push({ domain: table, error: '监控记录的配置、状态或关联无效' })
        }
    }
    return errors
}

const parseInput = async (request: Request) => {
    const type = request.headers.get('content-type') || ''
    if (type.includes('application/json')) return { input: await request.json(), batchId: null as number | null }
    if (!type.includes('multipart/form-data')) throw new Error('不支持的内容类型')
    const form = await request.formData()
    const file: unknown = form.get('file')
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024) throw new Error('导入文件不能超过 20 MiB（20 × 1024 × 1024 字节）')
    const rawBatchId = form.get('batch_id')
    const batchId = rawBatchId == null || rawBatchId === '' ? null : Number(rawBatchId)
    if (batchId != null && (!Number.isSafeInteger(batchId) || batchId <= 0)) throw new Error('导入批次编号无效')
    return { input: JSON.parse(await file.text()), batchId }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const parsed = await parseInput(context.request) as { input: Row | Row[]; batchId: number | null }
        const input = parsed.input as Row
        const importBatchId = parsed.batchId
        if (!input || Array.isArray(input) || input.format_version !== backupFormatVersion) return json(null, 400, '仅支持 format_version=1 的当前备份；旧备份须在升级前一次转换并核验')
        if (Object.keys(input).some(key => key !== 'format_version' && !(key in backupColumns))) return json(null, 400, '备份包含不支持的数据集合')
        for (const [table, columns] of Object.entries(backupColumns)) {
            if (input[table] !== undefined && (!Array.isArray(input[table]) || input[table].some((row: Row) => !row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !columns.includes(key))))) return json(null, 400, `${table} 包含不支持的字段或记录`)
        }
        const websites: Row[] = input.websites
        const domains: Row[] = input.domains
        if (!Array.isArray(websites) || !Array.isArray(domains) || websites.length > 500 || domains.length > 1000) return json(null, 400, '备份必须包含最多 500 个网站和 1000 个域名')
        const seen = new Set<string>()
        const errors: Array<{ domain: string; error: string }> = []
        for (const item of domains) {
            const key = normalizeDomain(String(item.domain || ''))
            if (!key || seen.has(key)) errors.push({ domain: String(item.domain || '未知'), error: '域名缺失或重复' })
            seen.add(key)
            if (item.website_id != null && !websites.some(site => Number(site.id) === Number(item.website_id))) errors.push({ domain: key || '未知', error: '关联的网站不在备份中' })
            const validation = validateDomain({ ...item, status: item.status || '在线' } as never)
            if (validation) errors.push({ domain: key || '未知', error: validation })
            if (item.domain_role !== undefined && (item.domain_role === '主域名') !== (item.is_primary === 1)) errors.push({ domain: key, error: '域名用途与主域名标记不一致' })
        }
        errors.push(...validateMonitoring(input, websites, domains))
        errors.push(...validateManagementBackup(input, new Set(websites.map(site => site.id))))
        for (const table of ['website_income', 'website_effort', 'website_tasks', 'website_operations', 'website_ai_notes', 'website_resources', 'website_accounts']) {
            if (input[table] === undefined) continue
            if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
            for (const row of input[table]) if (!row || !websites.some(site => site.id === row.website_id)) errors.push({ domain: table, error: '记录必须关联备份中的网站' })
        }
        for (const [table, field, parent] of [['website_click_snapshots', 'task_id', 'website_tasks'], ['website_ai_note_versions', 'note_id', 'website_ai_notes'], ['adsense_income', 'adsense_account_id', 'adsense_accounts'], ['website_resources', 'resource_id', 'provider_resources'], ['website_accounts', 'account_id', 'provider_accounts']] as const) {
            if (input[table] === undefined) continue
            if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
            for (const row of input[table]) if (!row || !Array.isArray(input[parent]) || !input[parent].some((item: Row) => item.id === row[field])) errors.push({ domain: table, error: `关联的 ${parent} 记录不在备份中` })
        }
        for (const table of ['websites', 'website_tasks', 'website_ai_notes', 'adsense_accounts', 'provider_accounts', 'provider_resources']) {
            if (input[table] === undefined) continue
            if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
            const ids = new Set<number>()
            for (const row of input[table]) {
                if (!row || !Number.isInteger(row.id) || row.id <= 0 || ids.has(row.id)) errors.push({ domain: table, error: '记录 ID 必须是唯一正整数' })
                if (row) ids.add(row.id)
            }
        }
        for (const site of websites) {
            const name = String(site.name || '未知网站')
            if (typeof site.name !== 'string' || !site.name.trim()) errors.push({ domain: name, error: '网站名称必填' })
            // Restore historical values exactly, including dates that were never recorded.
            const validation = validateWebsiteFields(site, {}, { snapshot: true })
            if (validation) errors.push({ domain: name, error: validation })
            if (!domains.some(domain => Number(domain.website_id) === Number(site.id))) errors.push({ domain: name, error: '网站至少需要一个关联域名' })
            if (domains.filter(domain => domain.website_id === site.id && domain.is_primary === 1).length !== 1) errors.push({ domain: name, error: '每个网站必须恰有一个主域名' })
            if (site.adsense_account_id != null) {
                const inBackup = Array.isArray(input.adsense_accounts) && input.adsense_accounts.some((account: Row) => Number(account.id) === Number(site.adsense_account_id))
                const inDatabase = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(site.adsense_account_id).first()
                if (!inBackup && !inDatabase) errors.push({ domain: name, error: '关联的 AdSense 账号不存在' })
            }
        }
        for (const task of Array.isArray(input.website_tasks) ? input.website_tasks : []) {
            if (task.review_of_task_id != null && !(input.website_tasks || []).some((parent: Row) => parent.id === task.review_of_task_id && parent.website_id === task.website_id && parent.task_type === 'SEO')) errors.push({ domain: task.title || '复查任务', error: 'SEO 复查必须关联同一网站的 SEO 任务' })
        }
        for (const table of ['website_batches', 'website_batch_members', 'website_batch_reviews']) {
            if (input[table] === undefined) continue
            if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
        }
        for (const batch of Array.isArray(input.website_batches) ? input.website_batches : []) {
            const validation = validateBatchFields(batch)
            if (validation) errors.push({ domain: batch.name || '批次', error: validation })
        }
        for (const member of Array.isArray(input.website_batch_members) ? input.website_batch_members : []) {
            if (!member || !input.website_batches?.some((batch: Row) => Number(batch.id) === Number(member.batch_id)) || !websites.some(site => Number(site.id) === Number(member.website_id))) errors.push({ domain: 'website_batch_members', error: '批次成员必须关联备份中的批次和网站' })
        }
        for (const review of Array.isArray(input.website_batch_reviews) ? input.website_batch_reviews : []) {
            if (!review || !input.website_batches?.some((batch: Row) => Number(batch.id) === Number(review.batch_id))) errors.push({ domain: 'website_batch_reviews', error: '复盘必须关联备份中的批次' })
        }
        for (const link of input.website_resources || []) {
            const resource = (input.provider_resources || []).find((row: Row) => row.id === link.resource_id)
            if (!resource || !resourceSupportsRole(resource.provider, link.role)) errors.push({ domain:'website_resources', error:'资源类型与用途不匹配' })
        }
        const gscTargets = new Map<number,number>()
        const matchedGscIds = new Set<number>()
        for (const row of Array.isArray(input.gsc_accounts) ? input.gsc_accounts : []) {
            if (typeof row.name !== 'string' || typeof row.email !== 'string') continue
            const name = row.name.trim(), email = row.email.trim().toLowerCase()
            const matches = (await context.env.DB.prepare("SELECT id FROM gsc_accounts WHERE name=? COLLATE NOCASE OR (?<>'' AND lower(email)=?)").bind(name,email,email).all<{id:number}>()).results || []
            if (matches.length > 1 || matches.length === 1 && matchedGscIds.has(matches[0].id)) errors.push({ domain:'gsc_accounts',error:'账号名称与邮箱指向冲突的现有账号，请先核对账号资料' })
            else if (matches.length === 1) { gscTargets.set(row.id,matches[0].id); matchedGscIds.add(matches[0].id) }
        }
        if (errors.length) return json({ total: domains.length, created: 0, updated: 0, success: 0, failed: errors.length, errors }, 400, '预校验失败，未写入数据')
        let created = 0
        for (const item of domains) if (!await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.'))=?").bind(normalizeDomain(item.domain)).first()) created++
        const updated = domains.length - created
        if (new URL(context.request.url).searchParams.get('dry_run') === '1') return json({ total: domains.length, created: websites.length, updated, success: 0, failed: 0, errors: [] }, 200, '预览完成，尚未写入')

        const db = context.env.DB
        if (importBatchId != null && !await db.prepare('SELECT id FROM website_batches WHERE id=?').bind(importBatchId).first()) return json(null, 404, '导入批次不存在')
        const siteMap = new Map<number, number>()
        const noteMap = new Map<number, number>()
        const taskMap = new Map<number, number>()
        const accountMap = new Map<number, number>()
        const resourceMap = new Map<number, number>()
        const batchMap = new Map<number, number>()

        const statements: D1PreparedStatement[] = []
        const write = (statement: D1PreparedStatement) => { statements.push(statement) }
        const nextIds = new Map<string, number>()
        const allocateId = async (table: string) => {
            if (!nextIds.has(table)) {
                const current = await db.prepare(`SELECT COALESCE(MAX(id),0) AS max_id FROM ${table}`).first<{ max_id: number }>()
                const incoming = Array.isArray(input[table]) ? input[table].map((row: Row) => Number(row.id) || 0) : []
                nextIds.set(table, Math.max(current?.max_id || 0, 0, ...incoming))
            }
            const id = nextIds.get(table)! + 1
            nextIds.set(table, id)
            return id
        }
        for (const site of websites) {
            const oldId = Number(site.id)
            const sameId = await db.prepare('SELECT id, name FROM websites WHERE id=?').bind(oldId).first<{ id: number; name: string }>()
            const target = sameId
            const keys = websiteColumns.filter(key => key !== 'adsense_account_id' && site[key] !== undefined)
            let siteId = target?.id
            if (siteId) {
                if (keys.length) write(db.prepare(`UPDATE websites SET ${keys.map(key => `${key}=?`).join(', ')} WHERE id=?`).bind(...keys.map(key => site[key]), siteId))
            } else {
                const values = websiteColumns.filter(key => key !== 'name' && key !== 'adsense_account_id' && site[key] !== undefined)
                const columns = ['name', ...values]
                const preserveId = Number.isInteger(oldId) && oldId > 0 && !sameId
                if (preserveId) columns.unshift('id')
                const insertValues = preserveId ? [oldId, site.name, ...values.map(key => site[key])] : [site.name, ...values.map(key => site[key])]
                write(db.prepare(`INSERT INTO websites (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).bind(...insertValues))
                siteId = oldId
            }
            if (siteId) siteMap.set(oldId, siteId)
        }
        for (const batch of input.website_batches || []) {
            const oldId = Number(batch.id)
            const existing = await db.prepare('SELECT id FROM website_batches WHERE id=?').bind(oldId).first<{ id: number }>()
            const batchId = existing?.id || (Number.isInteger(oldId) && oldId > 0 ? oldId : await allocateId('website_batches'))
            const columns = ['name', 'source', 'goal', 'hypothesis', 'status', 'review_conclusion', 'next_action', 'review_requested_at', 'reviewed_at', 'archived_at', 'created_at', 'updated_at']
            const values = columns.map(key => batch[key] ?? null)
            if (existing) write(db.prepare(`UPDATE website_batches SET ${columns.map(key => `${key}=?`).join(',')} WHERE id=?`).bind(...values, batchId))
            else write(db.prepare(`INSERT INTO website_batches (id,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`).bind(batchId, ...values))
            batchMap.set(oldId, batchId)
        }
        for (const member of input.website_batch_members || []) {
            const batchId = batchMap.get(Number(member.batch_id)); const websiteId = siteMap.get(Number(member.website_id)); if (!batchId || !websiteId) continue
            write(db.prepare(`INSERT INTO website_batch_members (id,batch_id,website_id,joined_at,member_note,membership_status,removed_at,removed_reason) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET batch_id=excluded.batch_id,website_id=excluded.website_id,joined_at=excluded.joined_at,member_note=excluded.member_note,membership_status=excluded.membership_status,removed_at=excluded.removed_at,removed_reason=excluded.removed_reason`).bind(member.id, batchId, websiteId, member.joined_at || new Date().toISOString(), member.member_note || null, member.membership_status || 'active', member.removed_at || null, member.removed_reason || null))
        }
        for (const review of input.website_batch_reviews || []) {
            const batchId = batchMap.get(Number(review.batch_id)); if (!batchId) continue
            write(db.prepare(`INSERT INTO website_batch_reviews (id,batch_id,reviewed_at,member_count,stage_counts,content_totals,conclusion,next_action) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET batch_id=excluded.batch_id,reviewed_at=excluded.reviewed_at,member_count=excluded.member_count,stage_counts=excluded.stage_counts,content_totals=excluded.content_totals,conclusion=excluded.conclusion,next_action=excluded.next_action`).bind(review.id, batchId, review.reviewed_at || new Date().toISOString(), review.member_count || 0, review.stage_counts, review.content_totals, review.conclusion || null, review.next_action || null))
        }
        for (const websiteId of siteMap.values()) write(db.prepare('UPDATE domains SET is_primary=0 WHERE website_id=?').bind(websiteId))
        for (const old of domains) {
            const domainName = normalizeDomain(old.domain)
            old.domain = domainName
            old.domain_role ??= old.is_primary === 1 ? '主域名' : '备用域名'
            const hasWebsiteField = old.website_id !== undefined
            const websiteId = old.website_id == null ? null : siteMap.get(Number(old.website_id)) || null
            if (old.website_id != null && !websiteId) continue
            const existing = await db.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.'))=?").bind(domainName).first<{ id: number }>()
            const values = domainColumns.filter(key => old[key] !== undefined)
            if (existing) {
                const assignments = [...values, ...(hasWebsiteField ? ['website_id'] : [])]
                const params = [...values.map(key => old[key]), ...(hasWebsiteField ? [websiteId] : []), existing.id]
                if (assignments.length) write(db.prepare(`UPDATE domains SET ${assignments.map(key => `${key}=?`).join(', ')} WHERE id=?`).bind(...params))
            } else {
                const cols = [...(hasWebsiteField ? ['website_id'] : []), ...values]
                const vals = [...(hasWebsiteField ? [websiteId] : []), ...values.map(key => old[key])]
                write(db.prepare(`INSERT INTO domains (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...vals))
            }
        }
        for (const account of input.adsense_accounts || []) {
            const existing = await db.prepare('SELECT id FROM adsense_accounts WHERE name=?').bind(account.name).first<{ id: number }>()
            const id = existing?.id || await allocateId('adsense_accounts')
            const values = [account.name, account.owner, account.currency || 'USD', account.status || '未知', account.publisher_id || null, account.opened_date || null, account.memo || '', account.created_at || null]
            write(existing ? db.prepare('UPDATE adsense_accounts SET name=?,owner=?,currency=?,status=?,publisher_id=?,opened_date=?,memo=?,created_at=COALESCE(?,created_at) WHERE id=?').bind(...values, id)
                : db.prepare('INSERT INTO adsense_accounts (id,name,owner,currency,status,publisher_id,opened_date,memo,created_at) VALUES (?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))').bind(id, ...values))
            accountMap.set(Number(account.id), id)
        }
        for (const site of websites) {
            if (site.adsense_account_id === undefined) continue
            const websiteId = siteMap.get(Number(site.id)); if (!websiteId) continue
            let accountId: number | null = null
            if (site.adsense_account_id != null) {
                accountId = accountMap.get(Number(site.adsense_account_id)) || null
                if (!accountId) accountId = (await db.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(site.adsense_account_id).first<{ id: number }>())?.id || null
            }
            write(db.prepare('UPDATE websites SET adsense_account_id=? WHERE id=?').bind(accountId, websiteId))
        }
        for (const site of websites) {
            const websiteId = siteMap.get(Number(site.id)); if (!websiteId) continue
            for (const row of (input.website_income || []).filter((item: Row) => Number(item.website_id) === Number(site.id))) write(db.prepare(`INSERT INTO website_income (website_id, income_month, source, currency, amount, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(website_id, income_month, source, currency) DO UPDATE SET amount=excluded.amount, memo=excluded.memo, created_at=excluded.created_at`).bind(websiteId, row.income_month, row.source, row.currency, row.amount, row.memo || null, row.created_at || null))
            for (const row of (input.website_effort || []).filter((item: Row) => Number(item.website_id) === Number(site.id))) write(db.prepare('INSERT INTO website_effort (website_id, week_start, hours, memo, created_at) VALUES (?, ?, ?, ?, COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(website_id, week_start) DO UPDATE SET hours=excluded.hours, memo=excluded.memo, created_at=excluded.created_at').bind(websiteId, row.week_start, row.hours, row.memo || null, row.created_at || null))
            for (const row of (input.website_operations || []).filter((item: Row) => Number(item.website_id) === Number(site.id))) write(db.prepare('INSERT INTO website_operations (website_id, operation_date, operation_kind, created_at) VALUES (?, ?, ?, COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(website_id,operation_date,operation_kind) DO UPDATE SET created_at=excluded.created_at').bind(websiteId, row.operation_date, row.operation_kind, row.created_at || null))
            const oldTasks = (input.website_tasks || []).filter((item: Row) => Number(item.website_id) === Number(site.id)).sort((a: Row, b: Row) => Number(Boolean(a.review_of_task_id)) - Number(Boolean(b.review_of_task_id)) || a.id - b.id)
            for (const row of oldTasks) {
                const parent = row.review_of_task_id ? taskMap.get(Number(row.review_of_task_id)) || null : null
                const existing = await db.prepare('SELECT id, website_id FROM website_tasks WHERE id=?').bind(row.id).first<{ id: number; website_id: number }>()
                const taskColumns = ['website_id', 'task_type', 'title', 'description', 'status', 'completion_summary', 'result_url', 'due_at', 'completed_at', 'review_of_task_id', 'review_delay_days', 'review_window_days', 'review_conclusion', 'review_basis', 'baseline_missing']
                const taskValues = [websiteId, row.task_type, row.title, row.description || null, row.status, row.completion_summary || null, row.result_url || null, row.due_at || null, row.completed_at || null, parent, row.review_delay_days || 28, row.review_window_days || 28, row.review_conclusion || null, row.review_basis || null, row.baseline_missing || 0]
                for (const key of ['created_at', 'updated_at']) if (row[key] !== undefined) { taskColumns.push(key); taskValues.push(row[key]) }
                let restoredId: number
                if (existing?.website_id === websiteId) {
                    write(db.prepare(`UPDATE website_tasks SET ${taskColumns.map(key => `${key}=?`).join(', ')} WHERE id=?`).bind(...taskValues, existing.id))
                    restoredId = existing.id
                } else {
                    restoredId = existing ? await allocateId('website_tasks') : Number(row.id)
                    taskColumns.unshift('id'); taskValues.unshift(restoredId)
                    write(db.prepare(`INSERT INTO website_tasks (${taskColumns.join(', ')}) VALUES (${taskColumns.map(() => '?').join(', ')})`).bind(...taskValues))
                }
                taskMap.set(Number(row.id), restoredId)
            }
        }
        for (const row of input.adsense_income || []) {
            const accountId = accountMap.get(Number(row.adsense_account_id)); if (!accountId) continue
            write(db.prepare(`INSERT INTO adsense_income (adsense_account_id, income_month, amount_usd, amount_cny, transfer_date, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(adsense_account_id, income_month) DO UPDATE SET amount_usd=excluded.amount_usd, amount_cny=excluded.amount_cny, transfer_date=excluded.transfer_date, memo=excluded.memo, created_at=excluded.created_at`).bind(accountId, row.income_month, row.amount_usd, row.amount_cny ?? null, row.transfer_date || null, row.memo || '', row.created_at || null))
        }
        for (const oldNote of input.website_ai_notes || []) {
            const websiteId = siteMap.get(Number(oldNote.website_id)); if (!websiteId) continue
            const existing = await db.prepare('SELECT id, website_id FROM website_ai_notes WHERE id=?').bind(oldNote.id).first<{ id: number; website_id: number }>()
            const noteId = existing?.website_id === websiteId ? existing.id : existing ? await allocateId('website_ai_notes') : Number(oldNote.id)
            const values = [websiteId, oldNote.kind, oldNote.content, oldNote.created_at || null, oldNote.updated_at || null, oldNote.archived_at || null]
            write(existing?.website_id === websiteId ? db.prepare('UPDATE website_ai_notes SET website_id=?,kind=?,content=?,created_at=?,updated_at=?,archived_at=? WHERE id=?').bind(...values, noteId)
                : db.prepare('INSERT INTO website_ai_notes (id,website_id,kind,content,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?)').bind(noteId,...values))
            noteMap.set(Number(oldNote.id), noteId)
        }
        for (const oldVersion of input.website_ai_note_versions || []) {
            const noteId = noteMap.get(Number(oldVersion.note_id)); if (!noteId) continue
            write(db.prepare('INSERT INTO website_ai_note_versions (note_id, kind, content, version_no, created_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM website_ai_note_versions WHERE note_id=? AND version_no=?)').bind(noteId, oldVersion.kind, oldVersion.content, oldVersion.version_no, oldVersion.created_at || null, noteId, oldVersion.version_no))
        }
        for (const oldSnapshot of input.website_click_snapshots || []) {
            const taskId = taskMap.get(Number(oldSnapshot.task_id)); if (!taskId) continue
            write(db.prepare('INSERT INTO website_click_snapshots (task_id, period_kind, period_start, period_end, clicks, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(task_id,period_kind) DO UPDATE SET period_start=excluded.period_start,period_end=excluded.period_end,clicks=excluded.clicks').bind(taskId, oldSnapshot.period_kind, oldSnapshot.period_start, oldSnapshot.period_end, oldSnapshot.clicks, oldSnapshot.created_at || null))
        }
        for (const providerAccount of input.provider_accounts || []) {
            const existing = await db.prepare('SELECT id FROM provider_accounts WHERE provider=? AND name=?').bind(providerAccount.provider, providerAccount.name).first<{ id: number }>()
            const id = existing?.id || await allocateId('provider_accounts')
            const columns = backupColumns.provider_accounts!.filter(key => key !== 'id' && providerAccount[key] !== undefined)
            write(existing ? db.prepare(`UPDATE provider_accounts SET ${columns.map(key => `${key}=?`).join(',')} WHERE id=?`).bind(...columns.map(key => providerAccount[key]), id)
                : db.prepare(`INSERT INTO provider_accounts (id,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`).bind(id,...columns.map(key => providerAccount[key])))
            resourceMap.set(-Number(providerAccount.id), id)
        }
        for (const oldResource of input.provider_resources || []) {
            const accountId = oldResource.account_id == null ? null : resourceMap.get(-Number(oldResource.account_id)) || null
            const existing = await db.prepare('SELECT id FROM provider_resources WHERE account_id IS ? AND name=?').bind(accountId, oldResource.name).first<{ id: number }>()
            const id = existing?.id || await allocateId('provider_resources')
            const columns = backupColumns.provider_resources!.filter(key => key !== 'id' && key !== 'account_id' && oldResource[key] !== undefined)
            write(existing ? db.prepare(`UPDATE provider_resources SET account_id=?,${columns.map(key => `${key}=?`).join(',')} WHERE id=?`).bind(accountId,...columns.map(key => oldResource[key]), id)
                : db.prepare(`INSERT INTO provider_resources (id,account_id,${columns.join(',')}) VALUES (?,?,${columns.map(() => '?').join(',')})`).bind(id,accountId,...columns.map(key => oldResource[key])))
            resourceMap.set(Number(oldResource.id), id)
        }
        for (const link of input.website_resources || []) {
            const websiteId = siteMap.get(Number(link.website_id)); const resourceId = resourceMap.get(Number(link.resource_id)); if (!websiteId || !resourceId) continue
            const role = link.role
            if (link.is_primary) write(db.prepare('UPDATE website_resources SET is_primary=0 WHERE website_id=? AND role=?').bind(websiteId, role))
            write(db.prepare('INSERT INTO website_resources (website_id, resource_id, role, is_primary, memo, created_at) VALUES (?, ?, ?, ?, ?, COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(website_id, resource_id, role) DO UPDATE SET is_primary=excluded.is_primary, memo=excluded.memo, created_at=excluded.created_at').bind(websiteId, resourceId, role, link.is_primary || 0, link.memo || null, link.created_at || null))
        }
        for (const link of input.website_accounts || []) {
            const websiteId = siteMap.get(Number(link.website_id)); const accountId = resourceMap.get(-Number(link.account_id))
            if (websiteId && accountId) write(db.prepare('INSERT INTO website_accounts(website_id,account_id,memo,created_at) VALUES (?,?,?,COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(website_id,account_id) DO UPDATE SET memo=excluded.memo,created_at=excluded.created_at').bind(websiteId,accountId,link.memo || '',link.created_at || null))
        }
        const gscMap = new Map<number,number>()
        for (const row of input.gsc_accounts || []) {
            const name = row.name.trim(), email = row.email.trim().toLowerCase()
            const existingId = gscTargets.get(row.id)
            const id = existingId || await allocateId('gsc_accounts')
            write(existingId ? db.prepare('UPDATE gsc_accounts SET name=?,email=?,created_at=COALESCE(?,created_at) WHERE id=?').bind(name,email,row.created_at || null,id)
                : db.prepare(`INSERT INTO gsc_accounts(id,name,email,created_at) VALUES(?,?,?,COALESCE(?,strftime('%Y-%m-%dT%H:%M:%fZ','now')))`).bind(id,name,email,row.created_at || null))
            gscMap.set(row.id,id)
        }
        if (input.website_gsc_accounts !== undefined) {
            write(db.prepare('DELETE FROM website_gsc_accounts WHERE website_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...siteMap.values()])))
            for (const row of input.website_gsc_accounts) write(db.prepare('INSERT INTO website_gsc_accounts(website_id,account_id) VALUES(?,?)').bind(siteMap.get(row.website_id)!,gscMap.get(row.account_id)!))
        }
        if (input.website_work_records !== undefined) {
            write(db.prepare('DELETE FROM website_work_records WHERE website_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...siteMap.values()])))
            for (let offset=0; offset<input.website_work_records.length; offset+=500) {
                const rows = input.website_work_records.slice(offset,offset+500).map((row:Row) => [siteMap.get(row.website_id)!,row.kind,row.request_id,row.created_at,row.voided_at ?? null])
                write(db.prepare(`INSERT INTO website_work_records(website_id,kind,request_id,created_at,voided_at) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]') FROM json_each(?)`).bind(JSON.stringify(rows)))
            }
        }
        const restoreTime = new Date().toISOString()
        for (const row of input.website_monitors || []) {
            const websiteId = siteMap.get(row.website_id)!
            const snapshotDomain = domains.find(domain => domain.id === row.domain_id)
            const matchesPrimary = snapshotDomain?.is_primary !== 0 && snapshotDomain && row.domain != null
                && normalizeDomain(snapshotDomain.domain) === normalizeDomain(row.domain)
            const columns = ['website_id', 'domain_id', 'domain', 'enabled', 'allowed_redirect_hosts', 'status', 'reason', 'http_status', 'response_ms', 'final_url', 'title', 'checked_at', 'next_check_at', 'consecutive_failures', 'config_version', 'lease_token', 'lease_until']
            const values = [websiteId, Number(row.enabled ?? 1), JSON.stringify(monitorRules(row.allowed_redirect_hosts ?? '[]')), matchesPrimary ? row.status ?? 'unchecked' : 'unchecked',
                ...['reason', 'http_status', 'response_ms', 'final_url', 'title', 'checked_at'].map(key => matchesPrimary ? row[key] ?? null : null),
                restoreTime, matchesPrimary ? row.consecutive_failures ?? 0 : 0, row.config_version ?? 0]
            // Resolve the actual primary ID after the planned domain inserts/updates execute.
            write(db.prepare(`INSERT INTO website_monitors (${columns.join(',')})
                SELECT ?,d.id,d.domain,${values.slice(1).map(() => '?').join(',')},NULL,NULL
                FROM websites w LEFT JOIN domains d ON d.website_id=w.id AND d.is_primary=1 WHERE w.id=?
                ON CONFLICT(website_id) DO UPDATE SET ${columns.slice(1).map(key => `${key}=excluded.${key}`).join(',')}`)
                .bind(...values, websiteId))
        }
        // Each supplied history collection replaces that collection for the restored websites.
        // IDs are local identities: no other table references checks or incidents.
        for (const table of ['website_monitor_checks', 'website_monitor_incidents'] as const) {
            if (input[table] === undefined) continue
            write(db.prepare(`DELETE FROM ${table} WHERE website_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify([...siteMap.values()])))
            const columns = table === 'website_monitor_checks'
                ? ['website_id', 'domain', 'checked_at', 'outcome', 'reason', 'http_status', 'response_ms', 'final_url', 'title']
                : ['website_id', 'domain', 'reason', 'opened_at', 'last_seen_at', 'resolved_at', 'read_at']
            // Only trusted table/column names enter SQL; row values stay in JSON bindings.
            const insertSql = `INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map((_, index) => `json_extract(value, '$[${index}]')`).join(',')} FROM json_each(?)`
            const encoder = new TextEncoder()
            let chunk: string[] = []; let chunkBytes = 2 // JSON array brackets
            const flush = () => {
                if (!chunk.length) return
                write(db.prepare(insertSql).bind(`[${chunk.join(',')}]`))
                chunk = []; chunkBytes = 2
            }
            for (const row of input[table]) {
                const values = columns.map(key => key === 'website_id' ? siteMap.get(row.website_id)! : row[key] ?? null)
                const serialized = JSON.stringify(values)
                const rowBytes = encoder.encode(serialized).byteLength
                if (chunkBytes + rowBytes + (chunk.length ? 1 : 0) > 512 * 1024) flush()
                chunkBytes += rowBytes + (chunk.length ? 1 : 0)
                chunk.push(serialized)
            }
            flush()
        }
        for (const websiteId of siteMap.values()) write(db.prepare('UPDATE website_monitors SET lease_token=NULL,lease_until=NULL,next_check_at=?,config_version=config_version+1 WHERE website_id=?').bind(restoreTime, websiteId))
        // The runner belongs to this environment. Never import backup heartbeat/error fields.
        write(db.prepare('UPDATE monitor_runner SET lease_token=NULL,lease_until=NULL WHERE id=1'))
        if (statements.length) await db.batch(statements)
        if (importBatchId != null) {
            const members = [...new Set(siteMap.values())].map(websiteId => db.prepare(`INSERT INTO website_batch_members (batch_id,website_id,membership_status) VALUES (?,?,'active') ON CONFLICT(batch_id,website_id,membership_status) DO NOTHING`).bind(importBatchId, websiteId))
            if (members.length) await db.batch(members)
        }
        return json({ total: domains.length, created: websites.length, updated, success: domains.length, failed: 0, errors: [] }, 200, '导入完成')
    } catch (error) { return json(null, error instanceof SyntaxError ? 400 : 500, error instanceof SyntaxError ? 'JSON 格式无效，未导入数据' : error instanceof Error ? error.message : '导入失败；请检查文件并重试') }
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    try {
        const rows = await Promise.all(Object.entries(backupColumns).map(async ([table, columns]) => [table, (await context.env.DB.prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY ${columns[0]}`).all()).results || []] as const))
        return json({ format_version: backupFormatVersion, ...Object.fromEntries(rows) })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '备份读取失败') }
}
