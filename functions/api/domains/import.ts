import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'
import { validateWebsiteFields } from '../../domain/website-validation'
import { normalizeWebsiteIndustry } from '../../../shared/website-classification'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const websiteColumns = ['name', 'stage', 'lifecycle', 'ownership', 'industry', 'platform', 'platform_other', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'gsc_connected', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'potential', 'priority_order', 'next_action', 'next_action_due_date', 'next_action_status']
const domainColumns = ['domain', 'registrar', 'registrar_link', 'registrar_date', 'expiry_date', 'service_type', 'domain_role', 'is_primary', 'status', 'memo', 'last_status_check_at', 'computer_name']
type Row = Record<string, any>

const parseInput = async (request: Request) => {
    const type = request.headers.get('content-type') || ''
    if (type.includes('application/json')) return request.json()
    if (!type.includes('multipart/form-data')) throw new Error('不支持的内容类型')
    const file = (await request.formData()).get('file')
    if (!(file instanceof File) || file.size > 2_000_000) throw new Error('导入文件不能超过 2 MB')
    return JSON.parse(await file.text())
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const input = await parseInput(context.request) as Row
        const legacy = Array.isArray(input)
        const websites: Row[] = legacy ? [] : input?.websites
        const domains: Row[] = legacy ? input : input?.domains
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
        }
        if (!legacy) {
            for (const table of ['website_income', 'website_effort', 'website_tasks', 'website_operations', 'website_ai_notes', 'website_resources']) {
                if (input[table] === undefined) continue
                if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
                for (const row of input[table]) if (!row || !websites.some(site => site.id === row.website_id)) errors.push({ domain: table, error: '记录必须关联备份中的网站' })
            }
            for (const [table, field, parent] of [['website_click_snapshots', 'task_id', 'website_tasks'], ['website_ai_note_versions', 'note_id', 'website_ai_notes'], ['adsense_income', 'adsense_account_id', 'adsense_accounts'], ['website_resources', 'resource_id', 'provider_resources']] as const) {
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
                const validation = validateWebsiteFields({ ...site, industry: normalizeWebsiteIndustry(site.industry) })
                if (validation) errors.push({ domain: name, error: validation })
                if (!domains.some(domain => Number(domain.website_id) === Number(site.id))) errors.push({ domain: name, error: '网站至少需要一个关联域名' })
                if (site.adsense_account_id != null) {
                    const inBackup = Array.isArray(input.adsense_accounts) && input.adsense_accounts.some((account: Row) => Number(account.id) === Number(site.adsense_account_id))
                    const inDatabase = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(site.adsense_account_id).first()
                    if (!inBackup && !inDatabase) errors.push({ domain: name, error: '关联的 AdSense 账号不存在' })
                }
            }
            for (const task of Array.isArray(input.website_tasks) ? input.website_tasks : []) {
                if (task.review_of_task_id != null && !(input.website_tasks || []).some((parent: Row) => parent.id === task.review_of_task_id && parent.website_id === task.website_id && parent.task_type === 'SEO')) errors.push({ domain: task.title || '复查任务', error: 'SEO 复查必须关联同一网站的 SEO 任务' })
            }
        } else {
            for (const domain of domains) {
                const validation = validateWebsiteFields({
                    name: domain.site_name || normalizeDomain(String(domain.domain || '')),
                    ownership: domain.ownership || '自营网站',
                    industry: normalizeWebsiteIndustry(domain.industry),
                    platform: domain.platform || '其他',
                    platform_other: domain.platform_other || null,
                    adsense_account_id: domain.adsense_account_id ?? null,
                    adsense_connected: domain.adsense_connected || '未知',
                    adsense_opened_date: domain.adsense_opened_date || null,
                    gsc_connected: domain.gsc_connected || '未知',
                    seo_last_date: domain.seo_last_date || null,
                    daily_clicks: domain.daily_clicks ?? null,
                    daily_clicks_range: domain.daily_clicks_range || null,
                    clicks_updated_date: domain.clicks_updated_date || null,
                    wp_calculator_count: domain.wp_calculator_count ?? null,
                    wp_article_count: domain.wp_article_count ?? null,
                    content_stats_updated_date: domain.content_stats_updated_date || null
                })
                if (validation) errors.push({ domain: String(domain.domain || '未知'), error: validation })
                if (domain.adsense_account_id != null && !await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(domain.adsense_account_id).first()) errors.push({ domain: String(domain.domain || '未知'), error: '关联的 AdSense 账号不存在' })
            }
        }
        if (errors.length) return json({ total: domains.length, created: 0, updated: 0, success: 0, failed: errors.length, errors }, 400, '预校验失败，未写入数据')
        let created = 0
        for (const item of domains) if (!await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.'))=?").bind(normalizeDomain(item.domain)).first()) created++
        const updated = domains.length - created
        if (new URL(context.request.url).searchParams.get('dry_run') === '1') return json({ total: domains.length, created: legacy ? created : websites.length, updated, success: 0, failed: 0, errors: [] }, 200, '预览完成，尚未写入')

        const db = context.env.DB
        const siteMap = new Map<number, number>()
        const noteMap = new Map<number, number>()
        const taskMap = new Map<number, number>()
        const accountMap = new Map<number, number>()
        const resourceMap = new Map<number, number>()

        if (legacy) {
            for (const old of domains) {
                const domainName = normalizeDomain(old.domain)
                const existing = await db.prepare("SELECT id, website_id FROM domains WHERE lower(rtrim(domain, '.'))=?").bind(domainName).first<{ id: number; website_id: number | null }>()
                let websiteId = existing?.website_id || null
                if (!websiteId) {
                    const name = String(old.site_name || domainName)
                    const createdSite = await db.prepare(`INSERT INTO websites (name, ownership, industry, platform, platform_other, adsense_account_id, adsense_connected, adsense_opened_date, gsc_connected, seo_last_date, daily_clicks, daily_clicks_range, clicks_updated_date, wp_calculator_count, wp_article_count, content_stats_updated_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
                        .bind(name, old.ownership || '自营网站', old.industry || null, old.platform || '其他', old.platform_other || null, old.adsense_account_id ?? null, old.adsense_connected || '未知', old.adsense_opened_date || null, old.gsc_connected || '未知', old.seo_last_date || null, old.daily_clicks ?? null, old.daily_clicks_range || null, old.clicks_updated_date || null, old.wp_calculator_count ?? null, old.wp_article_count ?? null, old.content_stats_updated_date || null).first<{ id: number }>()
                    websiteId = createdSite?.id || null
                }
                if (!websiteId) continue
                if (existing) {
                    await db.prepare(`UPDATE domains SET website_id=?, registrar=?, registrar_link=?, registrar_date=?, expiry_date=?, service_type=?, status=?, memo=?, computer_name=? WHERE id=?`)
                        .bind(websiteId, old.registrar || '', old.registrar_link || null, old.registrar_date || '', old.expiry_date || '', old.service_type || '网站', old.status || '在线', old.memo || null, old.computer_name || null, existing.id).run()
                } else {
                    await db.prepare(`INSERT INTO domains (website_id, domain, registrar, registrar_link, registrar_date, expiry_date, service_type, status, memo, computer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
                        .bind(websiteId, domainName, old.registrar || '', old.registrar_link || null, old.registrar_date || '', old.expiry_date || '', old.service_type || '网站', old.status || '在线', old.memo || null, old.computer_name || null).first<{ id: number }>()
                }
                if (Array.isArray(old.todos)) for (const todo of old.todos) await db.prepare("INSERT INTO website_tasks (website_id, task_type, title, description, status) VALUES (?, '其他', ?, ?, '待做')").bind(websiteId, String(todo.title || '').slice(0, 200), todo.description || null).run()
                if (Array.isArray(old.operations)) for (const operation of old.operations) await db.prepare('INSERT OR IGNORE INTO website_operations (website_id, operation_date, operation_kind) VALUES (?, ?, ?)').bind(websiteId, operation.operation_date, operation.operation_kind).run()
                if (Array.isArray(old.ai_notes)) for (const note of old.ai_notes) {
                    const inserted = await db.prepare('INSERT INTO website_ai_notes (website_id, kind, content) VALUES (?, ?, ?) RETURNING id').bind(websiteId, note.kind, note.content).first<{ id: number }>()
                    if (inserted) await db.prepare('INSERT INTO website_ai_note_versions (note_id, kind, content, version_no) VALUES (?, ?, ?, 1)').bind(inserted.id, note.kind, note.content).run()
                }
            }
        } else {
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
            for (const websiteId of siteMap.values()) write(db.prepare('UPDATE domains SET is_primary=0 WHERE website_id=?').bind(websiteId))
            for (const old of domains) {
                const domainName = normalizeDomain(old.domain)
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
                const values = [account.name, account.owner, account.currency || 'USD', account.status || '未知', account.publisher_id || null, account.opened_date || null, account.memo || '']
                write(existing ? db.prepare('UPDATE adsense_accounts SET name=?,owner=?,currency=?,status=?,publisher_id=?,opened_date=?,memo=? WHERE id=?').bind(...values, id)
                    : db.prepare('INSERT INTO adsense_accounts (id,name,owner,currency,status,publisher_id,opened_date,memo) VALUES (?,?,?,?,?,?,?,?)').bind(id, ...values))
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
                for (const row of (input.website_income || []).filter((item: Row) => Number(item.website_id) === Number(site.id))) write(db.prepare(`INSERT INTO website_income (website_id, income_month, source, currency, amount, memo) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(website_id, income_month, source, currency) DO UPDATE SET amount=excluded.amount, memo=excluded.memo`).bind(websiteId, row.income_month, row.source, row.currency, row.amount, row.memo || null))
                for (const row of (input.website_effort || []).filter((item: Row) => Number(item.website_id) === Number(site.id))) write(db.prepare('INSERT INTO website_effort (website_id, week_start, hours, memo) VALUES (?, ?, ?, ?) ON CONFLICT(website_id, week_start) DO UPDATE SET hours=excluded.hours, memo=excluded.memo').bind(websiteId, row.week_start, row.hours, row.memo || null))
                for (const row of (input.website_operations || []).filter((item: Row) => Number(item.website_id) === Number(site.id))) write(db.prepare('INSERT OR IGNORE INTO website_operations (website_id, operation_date, operation_kind) VALUES (?, ?, ?)').bind(websiteId, row.operation_date, row.operation_kind))
                const oldTasks = (input.website_tasks || []).filter((item: Row) => Number(item.website_id) === Number(site.id)).sort((a: Row, b: Row) => Number(Boolean(a.review_of_task_id)) - Number(Boolean(b.review_of_task_id)) || a.id - b.id)
                for (const row of oldTasks) {
                    const parent = row.review_of_task_id ? taskMap.get(Number(row.review_of_task_id)) || null : null
                    const existing = await db.prepare('SELECT id, website_id FROM website_tasks WHERE id=?').bind(row.id).first<{ id: number; website_id: number }>()
                    const taskColumns = ['website_id', 'task_type', 'title', 'description', 'status', 'completion_summary', 'result_url', 'due_at', 'completed_at', 'review_of_task_id', 'review_delay_days', 'review_window_days', 'review_conclusion', 'review_basis', 'baseline_missing']
                    const taskValues = [websiteId, row.task_type, row.title, row.description || null, row.status, row.completion_summary || null, row.result_url || null, row.due_at || null, row.completed_at || null, parent, row.review_delay_days || 28, row.review_window_days || 28, row.review_conclusion || null, row.review_basis || null, row.baseline_missing || 0]
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
                write(db.prepare(`INSERT INTO adsense_income (adsense_account_id, income_month, amount, amount_usd, amount_cny, transfer_date, memo) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(adsense_account_id, income_month) DO UPDATE SET amount=excluded.amount, amount_usd=excluded.amount_usd, amount_cny=excluded.amount_cny, transfer_date=excluded.transfer_date, memo=excluded.memo`).bind(accountId, row.income_month, row.amount, row.amount_usd, row.amount_cny ?? null, row.transfer_date || null, row.memo || ''))
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
                if (!existing) write(db.prepare('INSERT INTO provider_accounts (id,provider,name,login_email,status,memo) VALUES (?,?,?,?,?,?)').bind(id,providerAccount.provider,providerAccount.name,providerAccount.login_email || null,providerAccount.status || '正常',providerAccount.memo || ''))
                resourceMap.set(-Number(providerAccount.id), id)
            }
            for (const oldResource of input.provider_resources || []) {
                const accountId = oldResource.account_id == null ? null : resourceMap.get(-Number(oldResource.account_id)) || null
                const existing = await db.prepare('SELECT id FROM provider_resources WHERE account_id IS ? AND name=?').bind(accountId, oldResource.name).first<{ id: number }>()
                const id = existing?.id || await allocateId('provider_resources')
                const identifier = typeof oldResource.identifier === 'string' && oldResource.identifier.startsWith('account:') && accountId ? `account:${accountId}` : oldResource.identifier || null
                if (!existing) write(db.prepare('INSERT INTO provider_resources (id,account_id,provider,name,resource_url,identifier,ip_address,port,region,status,expires_at,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,accountId,oldResource.provider,oldResource.name,oldResource.resource_url || null,identifier,oldResource.ip_address || null,oldResource.port || null,oldResource.region || null,oldResource.status || '正常',oldResource.expires_at || null,oldResource.memo || null))
                resourceMap.set(Number(oldResource.id), id)
            }
            for (const link of input.website_resources || []) {
                const websiteId = siteMap.get(Number(link.website_id)); const resourceId = resourceMap.get(Number(link.resource_id)); if (!websiteId || !resourceId) continue
                if (link.is_primary) write(db.prepare('UPDATE website_resources SET is_primary=0 WHERE website_id=?').bind(websiteId))
                write(db.prepare('INSERT INTO website_resources (website_id, resource_id, role, is_primary, memo) VALUES (?, ?, ?, ?, ?) ON CONFLICT(website_id, resource_id, role) DO UPDATE SET is_primary=excluded.is_primary, memo=excluded.memo').bind(websiteId, resourceId, link.role, link.is_primary || 0, link.memo || null))
            }
            if (statements.length) await db.batch(statements)
        }
        return json({ total: domains.length, created: legacy ? created : websites.length, updated, success: domains.length, failed: 0, errors: [] }, 200, '导入完成')
    } catch (error) { return json(null, error instanceof SyntaxError ? 400 : 500, error instanceof SyntaxError ? 'JSON 格式无效，未导入数据' : error instanceof Error ? error.message : '导入失败；请检查文件并重试') }
}
