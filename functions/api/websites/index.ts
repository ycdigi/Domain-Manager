import { cacheDomainFavicon } from '../../domain/favicons'
import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'
import { websiteFields } from '../../../shared/website-edits'
import { prepareWebsiteEdit, WebsiteEditError } from '../../domain/website-edits'
import { websiteIncomeRowsCte } from '../../domain/website-income'
import { websiteStages } from '../../../shared/website-classification'
import { isWebsiteNew } from '../../../shared/website-newness'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const siteFields = new Set<string>(websiteFields)

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const params = new URL(context.request.url).searchParams
        const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        const where: string[] = []
        const values: string[] = []
        if (params.has('stage')) { where.push('w.stage = ?'); values.push(params.get('stage') || '') }
        if (params.has('lifecycle')) { where.push('w.lifecycle = ?'); values.push(params.get('lifecycle') || '') }
        const [rows, incomeRows, incomeTotals] = await Promise.all([context.env.DB.prepare(`
            SELECT w.*,
                (SELECT a.name FROM adsense_accounts a WHERE a.id=w.adsense_account_id) AS adsense_account_name,
                (SELECT json_object('id',r.id,'account_id',r.account_id,'provider',r.provider,'provider_name',COALESCE(a.provider_name,CASE r.provider WHEN 'cloudflare' THEN 'Cloudflare' WHEN 'vhost' THEN '虚拟主机' ELSE 'VPS' END),'name',r.name,'ip_address',r.ip_address,'resource_url',r.resource_url,'status',r.status)
                 FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id LEFT JOIN provider_accounts a ON a.id=r.account_id WHERE wr.website_id=w.id AND wr.role='托管' AND wr.is_primary=1) AS hosting_json,
                (SELECT json_object('id',r.id,'name',r.name,'resource_url',r.resource_url,'account_id',r.account_id,'status',r.status)
                 FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE wr.website_id=w.id AND wr.role='代码仓库' AND wr.is_primary=1 AND r.provider='github') AS repository_json,
                (SELECT json_group_array(json_object('id', d.id, 'domain', d.domain, 'domain_role', d.domain_role, 'is_primary', d.is_primary, 'registrar', d.registrar, 'registrar_link', d.registrar_link, 'registrar_date', d.registrar_date, 'expiry_date', d.expiry_date, 'service_type', d.service_type, 'status', d.status, 'memo', d.memo, 'last_status_check_at', d.last_status_check_at))
                 FROM domains d WHERE d.website_id = w.id ORDER BY d.is_primary DESC, d.domain) AS domains_json,
                (SELECT COUNT(*) FROM website_tasks t WHERE t.website_id = w.id AND t.task_type <> 'SEO复查' AND t.status <> '已完成') AS open_task_count,
                (SELECT COUNT(*) FROM website_tasks t WHERE t.website_id = w.id AND t.task_type = 'SEO复查' AND t.status IN ('待做', '待跟进')) AS review_count,
                (SELECT json_object('week_start', e.week_start, 'hours', e.hours) FROM website_effort e WHERE e.website_id=w.id ORDER BY e.week_start DESC LIMIT 1) AS latest_effort_json,
                (SELECT json_group_array(DISTINCT wr.resource_id) FROM website_resources wr WHERE wr.website_id=w.id) AS resource_ids_json,
                (SELECT json_group_array(batch_id) FROM (SELECT batch_id FROM website_batch_members WHERE website_id=w.id AND membership_status='active' ORDER BY batch_id)) AS batch_ids_json,
                (SELECT json_group_array(account_id) FROM website_accounts WHERE website_id=w.id) AS direct_account_ids_json,
                (SELECT json_group_array(account_id) FROM (SELECT r.account_id FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE wr.website_id=w.id AND r.account_id IS NOT NULL UNION SELECT wa.account_id FROM website_accounts wa WHERE wa.website_id=w.id)) AS provider_account_ids_json,
                (SELECT json_group_array(json_object('id',a.id,'provider',a.provider,'provider_name',a.provider_name,'name',a.name)) FROM (SELECT pa.id,pa.provider,pa.provider_name,pa.name FROM provider_accounts pa WHERE pa.id IN (SELECT r.account_id FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE wr.website_id=w.id UNION SELECT wa.account_id FROM website_accounts wa WHERE wa.website_id=w.id) ORDER BY pa.id) a) AS provider_accounts_json,
                (SELECT GROUP_CONCAT(DISTINCT r.provider || ': ' || r.name) FROM website_resources wr JOIN provider_resources r ON r.id = wr.resource_id WHERE wr.website_id = w.id) AS resource_names
            FROM websites w ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY CASE w.stage ${websiteStages.map((stage,index) => `WHEN '${stage}' THEN ${index}`).join(' ')} ELSE ${websiteStages.length} END, w.lifecycle, w.priority_order, w.id
        `).bind(...values).all<Record<string, unknown>>(), context.env.DB.prepare(`
            ${websiteIncomeRowsCte}
            , latest_months AS (
                SELECT website_id, MAX(income_month) AS income_month
                FROM website_income_rows
                WHERE income_month <= ?
                GROUP BY website_id
            )
            SELECT income.id, income.website_id, income.income_month, income.source, income.currency, income.amount, income.origin
            FROM website_income_rows income
            JOIN latest_months latest ON latest.website_id=income.website_id
            WHERE income.income_month=? OR income.income_month=latest.income_month
            ORDER BY income.website_id, income.income_month DESC, income.currency COLLATE NOCASE, income.source COLLATE NOCASE
        `).bind(currentMonth, currentMonth).all<{ id: number | null; website_id: number; income_month: string; source: string; currency: string; amount: number; origin: string }>(), context.env.DB.prepare(`
            ${websiteIncomeRowsCte}
            SELECT website_id, upper(trim(currency)) AS currency, SUM(amount) AS amount
            FROM website_income_rows
            WHERE NOT (lower(trim(source)) = 'adsense' AND upper(trim(currency)) = 'CNY')
            GROUP BY website_id, upper(trim(currency))
            ORDER BY website_id, currency
        `).all<{ website_id: number; currency: string; amount: number }>()])
        const incomeByWebsite = new Map<number, Array<{ id: number | null; website_id: number; income_month: string; source: string; currency: string; amount: number; origin: string }>>()
        const incomeTotalsByWebsite = new Map<number, Array<{ currency: string; amount: number }>>()
        for (const item of incomeRows.results || []) {
            const entries = incomeByWebsite.get(item.website_id) || []
            entries.push(item)
            incomeByWebsite.set(item.website_id, entries)
        }
        for (const item of incomeTotals.results || []) incomeTotalsByWebsite.set(item.website_id, [...(incomeTotalsByWebsite.get(item.website_id) || []), { currency: item.currency, amount: Number(item.amount) }])
        return json((rows.results || []).map(row => {
            const { hosting_json: hostingJson, repository_json: repositoryJson, domains_json: domainsJson, latest_effort_json: effortJson, resource_ids_json: resourceIds, batch_ids_json: batchIds, direct_account_ids_json: directAccountIds, provider_account_ids_json: accountIds, provider_accounts_json: accountsJson, ...site } = row
            const domains = JSON.parse(String(domainsJson || '[]'))
            const siteIncomes = incomeByWebsite.get(Number(site.id)) || []
            const currentIncome = siteIncomes.filter(item => item.income_month === currentMonth)
            const latestMonth = siteIncomes[0]?.income_month
            const latestIncome = latestMonth ? siteIncomes.filter(item => item.income_month === latestMonth) : null
            const presentIncome = ({ income_month: _month, website_id: _websiteId, ...item }: typeof siteIncomes[number]) => item
            return {
                ...site,
                hosting: hostingJson ? JSON.parse(String(hostingJson)) : null,
                repository: repositoryJson ? JSON.parse(String(repositoryJson)) : null,
                industry: site.industry,
                domains,
                is_new_site: isWebsiteNew(site.new_site_override as number | null | undefined, domains.find((domain: { is_primary?: number }) => domain.is_primary)?.registrar_date || domains[0]?.registrar_date, today),
                current_income: currentIncome.map(presentIncome),
                latest_income: latestMonth && latestIncome ? { month: latestMonth, items: latestIncome.map(presentIncome) } : null,
                income_totals: incomeTotalsByWebsite.get(Number(site.id)) || [],
                latest_effort: effortJson ? JSON.parse(String(effortJson)) : null,
                resource_ids: JSON.parse(String(resourceIds || '[]')),
                batch_ids: JSON.parse(String(batchIds || '[]')),
                direct_account_ids: JSON.parse(String(directAccountIds || '[]')),
                provider_account_ids: JSON.parse(String(accountIds || '[]')),
                provider_accounts: JSON.parse(String(accountsJson || '[]')),
            }
        }).filter(site => params.get('new') === '1' ? site.is_new_site : params.get('new') === '0' ? !site.is_new_site : true))
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取网站失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        if (Object.keys(body).some(key => key !== 'domain' && !siteFields.has(key))) return json(null, 400, '网站创建包含不支持的字段')
        const domain = body.domain as Record<string, unknown> | undefined
        const fields = await prepareWebsiteEdit(context.env.DB, Object.fromEntries(Object.entries(body).filter(([key]) => siteFields.has(key))), 'human')
        if (!domain || typeof domain !== 'object') return json(null, 400, '新建网站必须同时提供一个域名')
        const domainError = validateDomain({ ...domain, status: domain.status || '在线' } as never)
        if (domainError) return json(null, 400, domainError)
        const name = typeof fields.name === 'string' ? fields.name.trim() : ''
        if (!name) return json(null, 400, '网站名称必填')
        const db = context.env.DB
        const domainName = String(domain.domain)
        const duplicate = await db.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ? LIMIT 1").bind(normalizeDomain(domainName)).first()
        if (duplicate) return json(null, 409, '该域名已存在')
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
        if (context.waitUntil) context.waitUntil(cacheDomainFavicon(context.env.DB, Number((domains.results?.[0] as {id:number})?.id)))
        return json({ website: created, domains: domains.results || [] }, 201, '网站已创建')
    } catch (error) { return json(null, error instanceof WebsiteEditError ? error.status : 500, error instanceof Error ? error.message : '网站创建失败') }
}
