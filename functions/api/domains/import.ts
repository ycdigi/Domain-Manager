import type { Env, ProviderType, Domain } from '../../types'
import { verifyToken } from '../../utils/auth'
import { domainTypes, isValidDailyClicksRange, isValidDate, normalizeDomain } from '../../utils/domain-validation'

import { isSiteOwnership, type SiteOwnership } from '../../../shared/website-classification'
import { prepareWebsiteChange, websiteWrite, WebsiteChangeError } from '../../domain/website-changes'
import { bindingWriteByDomain, primaryClearByDomainWrite } from '../../domain/resource-bindings'

interface ResourceImport { provider: ProviderType; account?: string | null; resource: string; role: string; is_primary?: number | boolean; memo?: string | null }
interface AiNoteImport { kind: 'AI提示词' | '想法说明'; content: string }
interface OperationImport { operation_date: string; operation_kind: 'SEO' | '内容' | '技术' | '其他' }
interface TodoImport { title: string; description?: string | null }
interface DomainImport {
    domain: string
    registrar?: string
    registrar_link?: string | null
    registrar_date?: string
    expiry_date?: string
    service_type?: string
    status?: string
    memo?: string | null
    site_name?: string | null
    computer_name?: string | null
    industry?: string | null
    ownership?: SiteOwnership
    adsense_account?: string | null
    adsense_connected?: string
    adsense_opened_date?: string | null
    seo_last_date?: string | null
    daily_clicks?: number | null
    daily_clicks_range?: 'under10' | '10to29' | '30to49' | '50to99' | 'over100' | null
    clicks_updated_date?: string | null
    platform?: 'WordPress' | 'Astro' | 'Next.js' | '其他'
    platform_other?: string | null
    wp_calculator_count?: number | null
    wp_article_count?: number | null
    content_stats_updated_date?: string | null
    resources?: ResourceImport[]
    ai_notes?: AiNoteImport[]
    operations?: OperationImport[]
    todos?: TodoImport[]
}

const providers = new Set<ProviderType>(['github', 'cloudflare', 'vhost', 'vps'])
const allowedFields = ['ownership', 'registrar', 'registrar_link', 'registrar_date', 'expiry_date', 'service_type', 'status', 'memo', 'site_name', 'industry', 'computer_name', 'adsense_connected', 'adsense_opened_date', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'platform', 'platform_other', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date'] as const
const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key)
const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestPost: PagesFunction<Env> = async context => {
    const auth = await verifyToken(context)
    if (!auth.success) return json(null, 401, auth.message || '未授权访问')
    try {
        const contentType = context.request.headers.get('content-type') || ''
        const contentLength = Number(context.request.headers.get('content-length') || 0)
        if (contentLength > 2_000_000) return json(null, 413, '导入文件不能超过 2 MB')
        let input: unknown
        if (contentType.includes('application/json')) {
            const text = await context.request.text()
            if (text.length > 2_000_000) return json(null, 413, '导入文件不能超过 2 MB')
            try { input = JSON.parse(text) } catch { return json(null, 400, 'JSON 文件格式无效') }
        }
        else if (contentType.includes('multipart/form-data')) {
            const file = (await context.request.formData()).get('file')
            if (!(file instanceof File) || file.size > 2_000_000) return json(null, 413, '导入文件不能超过 2 MB')
            try { input = JSON.parse(await file.text()) } catch { return json(null, 400, 'JSON 文件格式无效') }
        } else return json(null, 415, '不支持的内容类型')

        const records = Array.isArray(input) ? input : (input && typeof input === 'object' ? (input as { domains?: unknown }).domains : undefined)
        if (!Array.isArray(records) || records.length > 500) return json(null, 400, '数据必须是最多 500 条记录的数组')
        const domains = records as DomainImport[]
        const errors: Array<{ domain: string; error: string }> = []
        const seen = new Set<string>()
        const validate = (item: DomainImport) => {
            if (!item || typeof item !== 'object' || typeof item.domain !== 'string') return '域名字段缺失'
            for (const field of ['registrar', 'registrar_date', 'expiry_date', 'service_type', 'status'] as const) {
                if (item[field] !== undefined && typeof item[field] !== 'string') return `${field} 格式无效`
            }
            if (item.registrar_link != null && typeof item.registrar_link !== 'string') return '域名商链接格式无效'
            if (item.memo != null && typeof item.memo !== 'string') return '备注格式无效'
            if (item.computer_name != null && (typeof item.computer_name !== 'string' || item.computer_name.length > 120)) return '电脑名称格式无效或过长'
            if (item.site_name != null && (typeof item.site_name !== 'string' || item.site_name.length > 200)) return '网站名称格式无效或过长'
            if (has(item, 'ownership') && !isSiteOwnership(item.ownership)) return '网站归属关系无效'
            if (item.industry != null && (typeof item.industry !== 'string' || !domainTypes.includes(item.industry as typeof domainTypes[number]))) return '网站类型只能是计算器、资讯站或其他'
            if (item.adsense_account != null && typeof item.adsense_account !== 'string') return 'AdSense 账号名称格式无效'
            const domain = normalizeDomain(item.domain)
            if (!/^(?=.{3,255}$)[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/.test(domain)) return '域名格式无效'
            if (seen.has(domain)) return '文件中存在重复域名'
            seen.add(domain)
            for (const field of ['registrar_date', 'expiry_date', 'adsense_opened_date', 'seo_last_date'] as const) {
                if (has(item, field) && item[field] != null && item[field] !== '' && !isValidDate(item[field])) return `${field} 必须是有效的 YYYY-MM-DD 日期`
            }
            if (item.clicks_updated_date != null && item.clicks_updated_date !== '' && !isValidDate(item.clicks_updated_date)) return '点击数据日期格式无效'
            if (item.adsense_opened_date && item.registrar_date && item.adsense_opened_date < item.registrar_date) return 'AdSense 开通日期不能早于域名注册日期'
            if (item.status !== undefined && !['在线', '离线'].includes(item.status)) return '网站状态无效'
            if (item.adsense_connected !== undefined && !['未知', '已开通', '未开通'].includes(item.adsense_connected)) return 'AdSense 状态无效'
            if (item.adsense_connected === '已开通' && !isValidDate(item.adsense_opened_date)) return '已开通时必须填写有效开通日期'
            if (item.adsense_connected === '已开通' && !item.adsense_account?.trim()) return '已开通时必须填写 AdSense 账号名称'
            if (item.registrar_link) {
                try { if (!['http:', 'https:'].includes(new URL(item.registrar_link).protocol)) return '域名商链接必须使用 HTTP 或 HTTPS' }
                catch { return '域名商链接格式无效' }
            }
            if (item.daily_clicks !== undefined && item.daily_clicks !== null && (!Number.isInteger(item.daily_clicks) || item.daily_clicks < 0)) return '日点击次数必须是非负整数'
            if (item.daily_clicks_range !== undefined && item.daily_clicks_range !== null && !isValidDailyClicksRange(item.daily_clicks_range)) return '日点击区间无效'
            if (item.platform !== undefined && !['WordPress', 'Astro', 'Next.js', '其他'].includes(item.platform)) return '网站技术栈无效'
            if (item.platform_other != null && typeof item.platform_other !== 'string') return '其他技术栈名称格式无效'
            for (const field of ['wp_calculator_count', 'wp_article_count'] as const) {
                const value = item[field]
                if (value != null && (!Number.isInteger(value) || value < 0)) return 'WordPress 内容数量必须是非负整数'
                if (value != null && item.platform !== 'WordPress') return '只有 WordPress 网站可以填写内容数量'
            }
            if (item.content_stats_updated_date != null && item.content_stats_updated_date !== '' && !isValidDate(item.content_stats_updated_date)) return '内容统计日期格式无效'
            if ((item.wp_calculator_count != null || item.wp_article_count != null) && !isValidDate(item.content_stats_updated_date)) return '填写 WordPress 内容数量时必须填写统计日期'
            if (item.resources !== undefined && (!Array.isArray(item.resources) || item.resources.length > 20)) return '每个网站最多导入 20 个资源关联'
            if (item.ai_notes !== undefined && (!Array.isArray(item.ai_notes) || item.ai_notes.length > 50)) return '每个网站最多导入 50 条 AI 记录'
            if (item.operations !== undefined && (!Array.isArray(item.operations) || item.operations.length > 500)) return '每个网站最多导入 500 条操作记录'
            if (item.todos !== undefined && (!Array.isArray(item.todos) || item.todos.length > 100)) return '每个网站最多导入 100 条 Todo'
            for (const note of item.ai_notes || []) {
                if (!note || !['AI提示词', '想法说明'].includes(note.kind) || typeof note.content !== 'string' || !note.content.trim() || note.content.length > 20000) return 'AI 记录格式无效或内容过长'
            }
            for (const operation of item.operations || []) {
                if (!operation || !isValidDate(operation.operation_date) || !['SEO', '内容', '技术', '其他'].includes(operation.operation_kind)) return '操作记录格式无效'
            }
            for (const todo of item.todos || []) {
                if (!todo || typeof todo.title !== 'string' || !todo.title.trim() || todo.title.length > 200 || (todo.description != null && typeof todo.description !== 'string') || (todo.description?.length || 0) > 5000) return 'Todo 格式无效或内容过长'
            }
            const linkKeys = new Set<string>()
            let primaryCount = 0
            for (const link of item.resources || []) {
                const accountName = typeof link?.account === 'string' ? link.account.trim() : ''
                if (!link || typeof link !== 'object' || !providers.has(link.provider) || (link.provider !== 'vps' && !accountName) || (link.account != null && typeof link.account !== 'string') || typeof link.resource !== 'string' || !link.resource.trim() || typeof link.role !== 'string' || !link.role.trim()) return '资源关联字段无效'
                const key = `${link.provider}\0${accountName}\0${link.resource.trim()}\0${link.role.trim()}`
                if (linkKeys.has(key)) return '同一网站包含重复资源关联'
                linkKeys.add(key)
                if (link.is_primary === true || link.is_primary === 1) primaryCount++
            }
            if (primaryCount > 1) return '同一网站最多只能恢复一个主资源'
            if (['registrar', 'registrar_date', 'expiry_date', 'service_type', 'status'].some(key => !has(item, key) || !item[key as keyof DomainImport])) return '缺少必填字段'
            return null
        }

        domains.forEach(item => {
            const error = validate(item)
            if (error) errors.push({ domain: item?.domain || '未知域名', error })
        })
        if (errors.length) return json({ total: domains.length, success: 0, failed: errors.length, errors }, 400, '预校验失败，未写入任何数据')

        const db = context.env.DB
        const duplicateRows = await db.prepare("SELECT lower(rtrim(domain, '.')) AS domain_key, COUNT(*) AS count FROM domains GROUP BY lower(rtrim(domain, '.')) HAVING COUNT(*) > 1").all<{ domain_key: string; count: number }>()
        const duplicated = new Set((duplicateRows.results || []).map(row => row.domain_key))
        const duplicateUploads = domains.filter(item => duplicated.has(normalizeDomain(item.domain)))
        if (duplicateUploads.length) return json({ total: domains.length, success: 0, failed: duplicateUploads.length, errors: duplicateUploads.map(item => ({ domain: item.domain, error: '数据库中存在大小写不同的重复记录，请先手动整理这些记录' })) }, 409, '检测到历史重复域名，未写入任何数据')
        const accountsResult = await db.prepare('SELECT id, name FROM adsense_accounts').all<{ id: number; name: string }>()
        const accountIds = new Map((accountsResult.results || []).map(row => [row.name, row.id]))
        const resourcesResult = await db.prepare(`SELECT r.id, r.provider, r.name, a.name AS account_name FROM provider_resources r LEFT JOIN provider_accounts a ON a.id = r.account_id`).all<{ id: number; provider: ProviderType; name: string; account_name: string | null }>()
        const resourceIds = new Map<string, number>()
        const ambiguousResources = new Set<string>()
        for (const row of resourcesResult.results || []) {
            const key = `${row.provider}\0${row.account_name || ''}\0${row.name}`
            if (resourceIds.has(key)) ambiguousResources.add(key)
            else resourceIds.set(key, row.id)
        }
        for (const item of domains) {
            const adsenseAccount = item.adsense_account?.trim()
            if (adsenseAccount && !accountIds.has(adsenseAccount)) errors.push({ domain: item.domain, error: `找不到 AdSense 账号：${adsenseAccount}` })
            for (const link of item.resources || []) {
                const accountName = typeof link.account === 'string' ? link.account.trim() : ''
                const key = `${link.provider}\0${accountName}\0${link.resource.trim()}`
                const label = `${accountName || '未关联账号'} / ${link.resource}`
                if (ambiguousResources.has(key)) errors.push({ domain: item.domain, error: `资源名称无法唯一匹配：${label}` })
                else if (!resourceIds.has(key)) errors.push({ domain: item.domain, error: `找不到资源：${label}` })
            }
        }
        if (errors.length) return json({ total: domains.length, success: 0, failed: errors.length, errors }, 400, '资源预校验失败，未写入任何数据')

        const existingIds = new Map<string, number>()
        for (let offset = 0; offset < domains.length; offset += 25) {
            const chunk = domains.slice(offset, offset + 25)
            const existing = await db.prepare(`SELECT id, domain FROM domains WHERE lower(rtrim(domain, '.')) IN (${chunk.map(() => '?').join(',')})`)
                .bind(...chunk.map(item => normalizeDomain(item.domain))).all<{ id: number; domain: string }>()
            for (const row of existing.results || []) existingIds.set(normalizeDomain(row.domain), row.id)
        }
        const created = domains.filter(item => !existingIds.has(normalizeDomain(item.domain))).length
        const updated = domains.length - created
        if (new URL(context.request.url).searchParams.get('dry_run') === '1') {
            return json({ total: domains.length, created, updated, success: 0, failed: 0, errors: [] }, 200, '预览完成，尚未写入')
        }

        let success = 0
        for (let offset = 0; offset < domains.length; offset += 25) {
            const chunk = domains.slice(offset, offset + 25)
            const statements: D1PreparedStatement[] = []
            for (const item of chunk) {
                const domain = normalizeDomain(item.domain)
                const id = existingIds.get(domain)
                const fields: Record<string, unknown> = { domain }
                for (const key of allowedFields) if (has(item, key)) fields[key] = item[key] === '' ? null : item[key]
                if (has(item, 'adsense_account')) fields.adsense_account_id = item.adsense_account?.trim() ? accountIds.get(item.adsense_account.trim()) : null
                const current = id ? await db.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first<Domain>() : null
                const change = prepareWebsiteChange(current, fields, id ? 'restore' : 'create')
                statements.push(websiteWrite(db, change, id, false))

                if (item.resources !== undefined) {
                    if (id) statements.push(db.prepare('DELETE FROM domain_resources WHERE domain_id = ?').bind(id))
                    for (const link of item.resources) {
                        const resourceId = resourceIds.get(`${link.provider}\0${typeof link.account === 'string' ? link.account.trim() : ''}\0${link.resource.trim()}`)!
                        if (link.is_primary) statements.push(primaryClearByDomainWrite(db, domain))
                        statements.push(bindingWriteByDomain(db, { domainId: id || 0, role: link.role, isPrimary: link.is_primary, memo: link.memo }, resourceId, domain))
                    }
                }
                for (const note of item.ai_notes || []) {
                    statements.push(db.prepare(`
                        INSERT INTO domain_ai_notes (domain_id, kind, content)
                        SELECT id, ?, ? FROM domains
                        WHERE lower(rtrim(domain, '.')) = ?
                          AND NOT EXISTS (
                              SELECT 1 FROM domain_ai_notes n
                              WHERE n.domain_id = domains.id AND n.archived_at IS NULL AND n.kind = ? AND n.content = ?
                          )
                    `).bind(note.kind, note.content.trim(), domain, note.kind, note.content.trim()))
                    statements.push(db.prepare(`
                        INSERT INTO domain_ai_note_versions (note_id, kind, content, version_no)
                        SELECT n.id, n.kind, n.content, 1
                        FROM domain_ai_notes n
                        WHERE n.domain_id = (SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ?)
                          AND n.kind = ? AND n.content = ?
                          AND NOT EXISTS (SELECT 1 FROM domain_ai_note_versions v WHERE v.note_id = n.id)
                    `).bind(domain, note.kind, note.content.trim()))
                }
                for (const operation of item.operations || []) {
                    statements.push(db.prepare(`
                        INSERT OR IGNORE INTO domain_operations (domain_id, operation_date, operation_kind)
                        SELECT id, ?, ? FROM domains WHERE lower(rtrim(domain, '.')) = ?
                    `).bind(operation.operation_date, operation.operation_kind, domain))
                }
                for (const todo of item.todos || []) {
                    statements.push(db.prepare(`
                        INSERT INTO domain_todos (domain_id, title, description)
                        SELECT id, ?, ? FROM domains WHERE lower(rtrim(domain, '.')) = ?
                        AND NOT EXISTS (SELECT 1 FROM domain_todos t WHERE t.domain_id = domains.id AND t.title = ? AND COALESCE(t.description, '') = COALESCE(?, ''))
                    `).bind(todo.title.trim(), todo.description?.trim() || null, domain, todo.title.trim(), todo.description?.trim() || null))
                }
                success++
            }
            await db.batch(statements)
        }
        return json({ total: domains.length, created, updated, success, failed: 0, errors: [] }, 200, '导入完成')
    } catch (error) {
        if (error instanceof WebsiteChangeError) return json(null, 400, error.message)
        console.error('导入数据失败:', error)
        return json(null, 500, '导入失败；前序批次可能已完成，重复导入可安全重试')
    }
}
