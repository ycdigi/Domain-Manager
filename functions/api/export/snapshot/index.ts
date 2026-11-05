import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const db = context.env.DB
        const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())
        const [domains, operations, adsenseAccounts, income, incomeDomains, providerAccounts, resources, links, notes] = await Promise.all([
            db.prepare(`SELECT d.id, d.domain, d.registrar, d.registrar_link, d.registrar_date, d.expiry_date,
                d.service_type, d.status, d.memo, d.computer_name, d.adsense_connected, d.adsense_opened_date,
                d.site_name, d.industry,
                d.seo_last_date, d.daily_clicks, d.daily_clicks_range, d.clicks_updated_date, d.platform, d.platform_other,
                d.wp_calculator_count, d.wp_article_count, d.content_stats_updated_date,
                (SELECT MAX(o.operation_date) FROM domain_operations o WHERE o.domain_id = d.id) AS latest_operation_date,
                (SELECT COUNT(*) FROM domain_operations o WHERE o.domain_id = d.id) AS operation_count,
                a.name AS adsense_account, a.owner AS adsense_owner, a.publisher_id AS adsense_publisher_id,
                CASE WHEN d.adsense_opened_date IS NOT NULL AND d.registrar_date IS NOT NULL AND d.adsense_opened_date >= d.registrar_date
                    THEN CAST(julianday(d.adsense_opened_date) - julianday(d.registrar_date) AS INTEGER)
                    ELSE NULL END AS adsense_open_days
                FROM domains d LEFT JOIN adsense_accounts a ON a.id = d.adsense_account_id ORDER BY d.domain COLLATE NOCASE`).all(),
            db.prepare(`SELECT o.id, o.domain_id, d.domain, o.operation_date, o.operation_kind, o.created_at
                FROM domain_operations o JOIN domains d ON d.id = o.domain_id
                ORDER BY o.operation_date DESC, o.id DESC`).all(),
            db.prepare(`SELECT a.id, a.name, a.owner, a.publisher_id, a.currency, a.status, a.memo,
                COUNT(DISTINCT d.id) AS linked_domains,
                COALESCE((SELECT SUM(CASE WHEN i.amount_usd = 0 AND i.amount <> 0 THEN i.amount ELSE i.amount_usd END) FROM adsense_income i WHERE i.adsense_account_id = a.id AND i.income_month = ?), 0) AS current_income
                FROM adsense_accounts a LEFT JOIN domains d ON d.adsense_account_id = a.id
                GROUP BY a.id ORDER BY a.name COLLATE NOCASE`).bind(month).all(),
            db.prepare(`SELECT i.id, i.adsense_account_id, a.name AS adsense_account, a.owner, a.currency,
                i.income_month, CASE WHEN i.amount_usd = 0 AND i.amount <> 0 THEN i.amount ELSE i.amount_usd END AS amount_usd, i.amount_cny, i.transfer_date, i.memo, i.created_at
                FROM adsense_income i JOIN adsense_accounts a ON a.id = i.adsense_account_id
                ORDER BY i.income_month DESC, a.name COLLATE NOCASE`).all(),
            db.prepare(`SELECT x.income_id, x.domain_id, d.domain, d.site_name, x.amount_usd
                FROM adsense_income_domains x JOIN domains d ON d.id = x.domain_id ORDER BY d.domain COLLATE NOCASE`).all(),
            db.prepare(`SELECT id, provider, name, login_email, status, memo, created_at, updated_at
                FROM provider_accounts ORDER BY provider, name COLLATE NOCASE`).all(),
            db.prepare(`SELECT r.id, r.account_id, r.provider, r.name, r.resource_url, r.identifier,
                r.ip_address, r.port, r.region, r.status, r.expires_at, r.memo,
                a.name AS account_name, a.login_email
                FROM provider_resources r LEFT JOIN provider_accounts a ON a.id = r.account_id
                ORDER BY r.provider, r.name COLLATE NOCASE`).all(),
            db.prepare(`SELECT dr.id, dr.domain_id, d.domain, dr.resource_id, r.provider,
                r.name AS resource_name, a.name AS account_name, a.login_email,
                dr.role, dr.is_primary, dr.memo
                FROM domain_resources dr JOIN domains d ON d.id = dr.domain_id
                JOIN provider_resources r ON r.id = dr.resource_id
                LEFT JOIN provider_accounts a ON a.id = r.account_id
                ORDER BY d.domain COLLATE NOCASE, r.provider, r.name COLLATE NOCASE`).all(),
            db.prepare(`SELECT n.id, n.domain_id, d.domain, n.kind, n.content, n.created_at, n.updated_at
                FROM domain_ai_notes n JOIN domains d ON d.id = n.domain_id
                WHERE n.archived_at IS NULL ORDER BY d.domain COLLATE NOCASE, n.kind, n.updated_at DESC`).all()
        ])
        return json({
            domains: domains.results || [],
            operations: operations.results || [],
            adsense_accounts: adsenseAccounts.results || [],
            adsense_income: income.results || [],
            adsense_income_domains: incomeDomains.results || [],
            provider_accounts: providerAccounts.results || [],
            provider_resources: resources.results || [],
            domain_resources: links.results || [],
            ai_notes: notes.results || []
        })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取导出快照失败') }
}
