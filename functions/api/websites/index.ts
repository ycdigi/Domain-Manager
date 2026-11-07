import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'
import { validateWebsiteFields } from '../../domain/website-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const siteFields = new Set(['name', 'stage', 'lifecycle', 'ownership', 'industry', 'platform', 'platform_other', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'gsc_connected', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'potential', 'priority_order', 'next_action', 'next_action_due_date', 'next_action_status'])

const validSiteFields = (fields: Record<string, unknown>) => {
    return validateWebsiteFields(fields)
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const params = new URL(context.request.url).searchParams
        const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())
        const where: string[] = []
        const values: string[] = []
        if (params.has('stage')) { where.push('w.stage = ?'); values.push(params.get('stage') || '') }
        if (params.has('lifecycle')) { where.push('w.lifecycle = ?'); values.push(params.get('lifecycle') || '') }
        const rows = await context.env.DB.prepare(`
            SELECT w.*,
                (SELECT json_group_array(json_object('id', d.id, 'domain', d.domain, 'domain_role', d.domain_role, 'is_primary', d.is_primary, 'registrar', d.registrar, 'registrar_link', d.registrar_link, 'registrar_date', d.registrar_date, 'expiry_date', d.expiry_date, 'service_type', d.service_type, 'status', d.status, 'memo', d.memo, 'last_status_check_at', d.last_status_check_at))
                 FROM domains d WHERE d.website_id = w.id ORDER BY d.is_primary DESC, d.domain) AS domains_json,
                (SELECT COUNT(*) FROM website_tasks t WHERE t.website_id = w.id AND t.task_type <> 'SEO复查' AND t.status <> '已完成') AS open_task_count,
                (SELECT COUNT(*) FROM website_tasks t WHERE t.website_id = w.id AND t.task_type = 'SEO复查' AND t.status IN ('待做', '待跟进')) AS review_count,
                (SELECT json_group_array(json_object('source', i.source, 'currency', i.currency, 'amount', i.amount)) FROM website_income i WHERE i.website_id=w.id AND i.income_month=?) AS current_income_json,
                (SELECT json_object('week_start', e.week_start, 'hours', e.hours) FROM website_effort e WHERE e.website_id=w.id ORDER BY e.week_start DESC LIMIT 1) AS latest_effort_json,
                (SELECT json_group_array(DISTINCT wr.resource_id) FROM website_resources wr WHERE wr.website_id=w.id) AS resource_ids_json,
                (SELECT json_group_array(DISTINCT r.account_id) FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE wr.website_id=w.id AND r.account_id IS NOT NULL) AS provider_account_ids_json,
                (SELECT GROUP_CONCAT(DISTINCT r.provider || ': ' || r.name) FROM website_resources wr JOIN provider_resources r ON r.id = wr.resource_id WHERE wr.website_id = w.id) AS resource_names
            FROM websites w ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY CASE w.stage WHEN '验证' THEN 1 WHEN '增长' THEN 2 WHEN '维护' THEN 3 WHEN '暂停' THEN 4 ELSE 0 END, w.lifecycle, w.priority_order, w.id
        `).bind(currentMonth, ...values).all<Record<string, unknown>>()
        return json((rows.results || []).map(row => {
            const { domains_json: domainsJson, current_income_json: incomeJson, latest_effort_json: effortJson, resource_ids_json: resourceIds, provider_account_ids_json: accountIds, ...site } = row
            return { ...site, domains: JSON.parse(String(domainsJson || '[]')), current_income: JSON.parse(String(incomeJson || '[]')), latest_effort: effortJson ? JSON.parse(String(effortJson)) : null, resource_ids: JSON.parse(String(resourceIds || '[]')), provider_account_ids: JSON.parse(String(accountIds || '[]')) }
        }))
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取网站失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        const domain = body.domain as Record<string, unknown> | undefined
        const fields = Object.fromEntries(Object.entries(body).filter(([key]) => siteFields.has(key)))
        const fieldError = validSiteFields(fields)
        if (fieldError) return json(null, 400, fieldError)
        if (!domain || typeof domain !== 'object') return json(null, 400, '新建网站必须同时提供一个域名')
        const domainError = validateDomain({ ...domain, status: domain.status || '在线' } as never)
        if (domainError) return json(null, 400, domainError)
        const name = typeof fields.name === 'string' ? fields.name.trim() : ''
        if (!name) return json(null, 400, '网站名称必填')
        const db = context.env.DB
        const domainName = String(domain.domain)
        const duplicate = await db.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ? LIMIT 1").bind(normalizeDomain(domainName)).first()
        if (duplicate) return json(null, 409, '该域名已存在')
        const adsenseId = fields.adsense_account_id
        if (adsenseId != null && !await db.prepare('SELECT id FROM adsense_accounts WHERE id = ?').bind(adsenseId).first()) return json(null, 400, 'AdSense 账号不存在')
        const siteColumns = ['name', ...Object.keys(fields).filter(key => key !== 'name')]
        const siteValues = [name, ...siteColumns.slice(1).map(key => fields[key])]
        const placeholders = siteColumns.map(() => '?').join(', ')
        const statements = [
            db.prepare(`INSERT INTO websites (${siteColumns.join(', ')}) VALUES (${placeholders}) RETURNING id`).bind(...siteValues),
            db.prepare(`INSERT INTO domains (website_id, domain, registrar, registrar_link, registrar_date, expiry_date, service_type, status, memo, domain_role, is_primary)
                SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM websites WHERE id = last_insert_rowid()`)
                .bind(domainName, domain.registrar, domain.registrar_link || null, domain.registrar_date, domain.expiry_date, domain.service_type, domain.status || '在线', domain.memo || null, domain.domain_role || '主域名', 1)
        ]
        const result = await db.batch(statements)
        const firstResult = result[0] as { results?: Array<{ id: number }> }
        const websiteId = Number(firstResult.results?.[0]?.id)
        if (!websiteId) return json(null, 500, '网站创建失败')
        const created = await db.prepare('SELECT * FROM websites WHERE id = ?').bind(websiteId).first()
        const domains = await db.prepare('SELECT * FROM domains WHERE website_id = ?').bind(websiteId).all()
        return json({ website: created, domains: domains.results || [] }, 201, '网站已创建')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '网站创建失败') }
}
