import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'
import { validateWebsiteFields } from '../../domain/website-validation'
import { attemptRequestStatuses, attemptResultStatuses, canQueueOpportunity, opportunityStatusFromAttempt, validateOpportunityStatus, validateSourceInput } from '../../domain/link-sources'
import { normalizeWebsiteIndustry } from '../../../shared/website-classification'
import { generateSubmissionUrl, normalizeSourceUrl, normalizeTargetUrl, normalizeUrlTemplate } from '../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const websiteColumns = ['name', 'stage', 'lifecycle', 'ownership', 'industry', 'platform', 'platform_other', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'gsc_connected', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'potential', 'priority_order', 'next_action', 'next_action_due_date', 'next_action_status', 'new_site_override']
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
            for (const table of ['website_income', 'website_effort', 'website_tasks', 'website_operations', 'website_ai_notes', 'website_resources', 'website_link_opportunities']) {
                if (input[table] === undefined) continue
                if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
                for (const row of input[table]) if (!row || !websites.some(site => site.id === row.website_id)) errors.push({ domain: table, error: '记录必须关联备份中的网站' })
            }
            for (const table of ['link_sources', 'link_attempts']) {
                if (input[table] !== undefined && !Array.isArray(input[table])) errors.push({ domain: table, error: '记录必须为数组' })
            }
            for (const [table, field, parent] of [['website_click_snapshots', 'task_id', 'website_tasks'], ['website_ai_note_versions', 'note_id', 'website_ai_notes'], ['adsense_income', 'adsense_account_id', 'adsense_accounts'], ['website_resources', 'resource_id', 'provider_resources'], ['website_link_opportunities', 'source_id', 'link_sources'], ['link_attempts', 'opportunity_id', 'website_link_opportunities']] as const) {
                if (input[table] === undefined) continue
                if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
                for (const row of input[table]) if (!row || !Array.isArray(input[parent]) || !input[parent].some((item: Row) => item.id === row[field])) errors.push({ domain: table, error: `关联的 ${parent} 记录不在备份中` })
            }
            for (const table of ['websites', 'website_tasks', 'website_ai_notes', 'adsense_accounts', 'provider_accounts', 'provider_resources', 'link_sources', 'website_link_opportunities', 'link_attempts']) {
                if (input[table] === undefined) continue
                if (!Array.isArray(input[table])) { errors.push({ domain: table, error: '记录必须为数组' }); continue }
                const ids = new Set<number>()
                for (const row of input[table]) {
                    if (!row || !Number.isInteger(row.id) || row.id <= 0 || ids.has(row.id)) errors.push({ domain: table, error: '记录 ID 必须是唯一正整数' })
                    if (row) ids.add(row.id)
                }
            }
            const sourcesById = new Map<number, Row>()
            const sourceKeys = new Set<string>()
            for (const source of Array.isArray(input.link_sources) ? input.link_sources : []) {
                if (!source || !Number.isInteger(source.id)) continue
                const normalized = { ...source, approval_status: source.approval_status || '待审核', submission_mode: source.submission_mode || '仅观察', enabled: source.enabled ?? 0, source_type: source.source_type || '无法判断' }
                const validation = validateSourceInput(normalized)
                const sourceUrl = normalizeSourceUrl(source.source_url)
                const templateResult = source.url_template == null || source.url_template === '' ? { template: null, error: undefined } : normalizeUrlTemplate(source.url_template)
                const key = `${sourceUrl || ''}\u0000${templateResult.template || ''}`
                if (validation || !sourceUrl || templateResult.error) errors.push({ domain: `link_sources:${source.id}`, error: validation || templateResult.error || '来源 URL 无效' })
                if (normalized.approval_status !== '已批准' && Number(normalized.enabled) !== 0 && normalized.enabled !== false) errors.push({ domain: `link_sources:${source.id}`, error: '未批准来源不能启用' })
                if (sourceKeys.has(key)) errors.push({ domain: `link_sources:${source.id}`, error: '来源 URL 与模板重复' })
                sourceKeys.add(key)
                sourcesById.set(Number(source.id), { ...normalized, source_url: sourceUrl, url_template: templateResult.template })
            }
            const opportunitiesById = new Map<number, Row>()
            const attemptsByOpportunity = new Map<number, Row[]>()
            for (const opportunity of Array.isArray(input.website_link_opportunities) ? input.website_link_opportunities : []) {
                if (!opportunity || !Number.isInteger(opportunity.id)) continue
                const source = sourcesById.get(Number(opportunity.source_id))
                const status = opportunity.status || '待审核'
                const statusError = validateOpportunityStatus(status)
                const targetUrl = normalizeTargetUrl(opportunity.target_url)
                const submissionUrl = opportunity.submission_url == null || opportunity.submission_url === '' ? null : normalizeSourceUrl(opportunity.submission_url)
                const evidenceUrl = opportunity.evidence_url == null || opportunity.evidence_url === '' ? null : normalizeSourceUrl(opportunity.evidence_url)
                if (statusError) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: statusError })
                if (!source) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '关联的外链来源无效' })
                if (!targetUrl) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '目标 URL 无效' })
                if (opportunity.submission_url && !submissionUrl) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '提交 URL 无效' })
                if (opportunity.evidence_url && !evidenceUrl) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '证据 URL 无效' })
                if (source && ['待处理', '已生成提交地址'].includes(status) && !canQueueOpportunity(source.approval_status, source.enabled)) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '未批准或停用的来源不能保留在排队状态' })
                const generatedUrl = source && targetUrl ? generateSubmissionUrl(source.url_template, targetUrl) : null
                if (submissionUrl && normalizeSourceUrl(submissionUrl) !== normalizeSourceUrl(generatedUrl)) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '提交 URL 必须与来源模板和目标 URL 一致' })
                if (status === '已生成提交地址' && !submissionUrl) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '已生成提交地址状态必须保存对应 URL' })
                if (status === '已确认公开链接' && !evidenceUrl) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '已确认公开链接必须保留证据 URL' })
                opportunitiesById.set(Number(opportunity.id), { ...opportunity, status })
            }
            for (const attempt of Array.isArray(input.link_attempts) ? input.link_attempts : []) {
                if (!attempt || !Number.isInteger(attempt.id)) continue
                const requestStatus = attempt.request_status
                const resultStatus = attempt.result_status == null || attempt.result_status === '' ? null : attempt.result_status
                const method = attempt.method || '人工'
                const confirmed = attempt.confirmed_public_link === 1 || attempt.confirmed_public_link === true
                const evidenceUrl = attempt.evidence_url == null || attempt.evidence_url === '' ? null : normalizeSourceUrl(attempt.evidence_url)
                if (!['人工', '自动'].includes(method) || !attemptRequestStatuses.includes(requestStatus)) errors.push({ domain: `link_attempts:${attempt.id}`, error: '尝试方式或处理结果无效' })
                if (resultStatus !== null && (!attemptResultStatuses.includes(resultStatus) || method !== '人工' || requestStatus !== '已完成')) errors.push({ domain: `link_attempts:${attempt.id}`, error: '人工目录结论无效' })
                if (attempt.http_status != null && (!Number.isInteger(attempt.http_status) || attempt.http_status < 100 || attempt.http_status > 599)) errors.push({ domain: `link_attempts:${attempt.id}`, error: 'HTTP 状态码无效' })
                if (attempt.confirmed_public_link != null && ![0, 1, false, true].includes(attempt.confirmed_public_link)) errors.push({ domain: `link_attempts:${attempt.id}`, error: '公开链接确认值无效' })
                if (attempt.evidence_url && !evidenceUrl) errors.push({ domain: `link_attempts:${attempt.id}`, error: '尝试证据 URL 无效' })
                if (confirmed && (method !== '人工' || requestStatus !== '已完成' || resultStatus !== null || !evidenceUrl)) errors.push({ domain: `link_attempts:${attempt.id}`, error: '确认公开链接必须是带证据的人工已完成记录，不能同时包含其他结论' })
                const history = attemptsByOpportunity.get(Number(attempt.opportunity_id)) || []
                history.push({ ...attempt, method, result_status: resultStatus, confirmed_public_link: confirmed ? 1 : 0, evidence_url: evidenceUrl })
                attemptsByOpportunity.set(Number(attempt.opportunity_id), history)
            }
            for (const opportunity of opportunitiesById.values()) {
                if (!['请求已完成', '已提交待审核', '已确认公开链接', '被拒绝', '来源失效', '请求失败', '需要人工处理'].includes(opportunity.status)) continue
                const history = (attemptsByOpportunity.get(Number(opportunity.id)) || []).sort((left, right) => Number(right.id) - Number(left.id))
                const latest = history[0]
                const expectedStatus = latest ? opportunityStatusFromAttempt(latest.request_status, latest.confirmed_public_link, latest.result_status) : null
                if (expectedStatus !== opportunity.status) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '结果状态必须与最近一条人工尝试记录一致' })
                if (opportunity.status === '来源失效') {
                    const source = sourcesById.get(Number(opportunity.source_id))
                    if (source && (source.approval_status !== '已失效' || Number(source.enabled) !== 0)) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '来源失效结果必须同步停用来源' })
                }
                if (opportunity.status === '已确认公开链接' && latest?.evidence_url !== normalizeSourceUrl(opportunity.evidence_url)) errors.push({ domain: `website_link_opportunities:${opportunity.id}`, error: '公开链接结论与尝试证据不一致' })
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
        const linkSourceMap = new Map<number, number>()
        const opportunityMap = new Map<number, number>()

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
            for (const oldSource of input.link_sources || []) {
                const sourceUrl = normalizeSourceUrl(oldSource.source_url)!
                const template = oldSource.url_template == null || oldSource.url_template === '' ? null : normalizeUrlTemplate(oldSource.url_template).template
                const existing = await db.prepare('SELECT id FROM link_sources WHERE source_url=? AND url_template IS ?').bind(sourceUrl, template).first<{ id: number }>()
                const id = existing?.id || await allocateId('link_sources')
                const values = [oldSource.name, sourceUrl, oldSource.source_type || '无法判断', oldSource.country || null, oldSource.language || null, oldSource.topic_tags || null, template, oldSource.submission_mode || '仅观察', oldSource.approval_status || '待审核', oldSource.approval_status === '已批准' ? (oldSource.enabled ?? 1) : 0, oldSource.audit_flags || null, oldSource.last_checked_at || null, oldSource.memo || null]
                write(existing
                    ? db.prepare('UPDATE link_sources SET name=?,source_url=?,source_type=?,country=?,language=?,topic_tags=?,url_template=?,submission_mode=?,approval_status=?,enabled=?,audit_flags=?,last_checked_at=?,memo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...values, id)
                    : db.prepare('INSERT INTO link_sources (id,name,source_url,source_type,country,language,topic_tags,url_template,submission_mode,approval_status,enabled,audit_flags,last_checked_at,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, ...values))
                linkSourceMap.set(Number(oldSource.id), id)
            }
            for (const link of input.website_resources || []) {
                const websiteId = siteMap.get(Number(link.website_id)); const resourceId = resourceMap.get(Number(link.resource_id)); if (!websiteId || !resourceId) continue
                if (link.is_primary) write(db.prepare('UPDATE website_resources SET is_primary=0 WHERE website_id=?').bind(websiteId))
                write(db.prepare('INSERT INTO website_resources (website_id, resource_id, role, is_primary, memo) VALUES (?, ?, ?, ?, ?) ON CONFLICT(website_id, resource_id, role) DO UPDATE SET is_primary=excluded.is_primary, memo=excluded.memo').bind(websiteId, resourceId, link.role, link.is_primary || 0, link.memo || null))
            }
            for (const oldOpportunity of input.website_link_opportunities || []) {
                const websiteId = siteMap.get(Number(oldOpportunity.website_id)); const sourceId = linkSourceMap.get(Number(oldOpportunity.source_id)); if (!websiteId || !sourceId) continue
                const targetUrl = normalizeTargetUrl(oldOpportunity.target_url)!
                const existing = await db.prepare('SELECT id FROM website_link_opportunities WHERE website_id=? AND source_id=? AND target_url=?').bind(websiteId, sourceId, targetUrl).first<{ id: number }>()
                const id = existing?.id || await allocateId('website_link_opportunities')
                const values = [websiteId, sourceId, targetUrl, oldOpportunity.status || '待审核', oldOpportunity.submission_url ? normalizeSourceUrl(oldOpportunity.submission_url) : null, oldOpportunity.title || null, oldOpportunity.description || null, oldOpportunity.anchor_text || null, oldOpportunity.next_run_at || null, oldOpportunity.last_attempt_at || null, oldOpportunity.evidence_url ? normalizeSourceUrl(oldOpportunity.evidence_url) : null, oldOpportunity.last_error || null, oldOpportunity.memo || null]
                write(existing
                    ? db.prepare('UPDATE website_link_opportunities SET website_id=?,source_id=?,target_url=?,status=?,submission_url=?,title=?,description=?,anchor_text=?,next_run_at=?,last_attempt_at=?,evidence_url=?,last_error=?,memo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...values, id)
                    : db.prepare('INSERT INTO website_link_opportunities (id,website_id,source_id,target_url,status,submission_url,title,description,anchor_text,next_run_at,last_attempt_at,evidence_url,last_error,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, ...values))
                opportunityMap.set(Number(oldOpportunity.id), id)
            }
            for (const oldAttempt of input.link_attempts || []) {
                const opportunityId = opportunityMap.get(Number(oldAttempt.opportunity_id)); if (!opportunityId) continue
                const existing = await db.prepare('SELECT id FROM link_attempts WHERE id=?').bind(oldAttempt.id).first<{ id: number }>()
                const id = existing?.id || await allocateId('link_attempts')
                const values = [opportunityId, oldAttempt.attempted_at || null, oldAttempt.method || '人工', oldAttempt.request_status || '需要人工', oldAttempt.result_status || null, oldAttempt.http_status ?? null, oldAttempt.confirmed_public_link ? 1 : 0, oldAttempt.error_message || null, oldAttempt.response_summary || null, oldAttempt.evidence_url ? normalizeSourceUrl(oldAttempt.evidence_url) : null]
                write(existing
                    ? db.prepare('UPDATE link_attempts SET opportunity_id=?,attempted_at=?,method=?,request_status=?,result_status=?,http_status=?,confirmed_public_link=?,error_message=?,response_summary=?,evidence_url=? WHERE id=?').bind(...values, id)
                    : db.prepare('INSERT INTO link_attempts (id,opportunity_id,attempted_at,method,request_status,result_status,http_status,confirmed_public_link,error_message,response_summary,evidence_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id, ...values))
            }
            if (statements.length) await db.batch(statements)
        }
        return json({ total: domains.length, created: legacy ? created : websites.length, updated, success: domains.length, failed: 0, errors: [] }, 200, '导入完成')
    } catch (error) { return json(null, error instanceof SyntaxError ? 400 : 500, error instanceof SyntaxError ? 'JSON 格式无效，未导入数据' : error instanceof Error ? error.message : '导入失败；请检查文件并重试') }
}
