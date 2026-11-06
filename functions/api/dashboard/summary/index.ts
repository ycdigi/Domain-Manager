import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { isSiteOwnership } from '../../../../shared/website-classification'
import { isValidDate } from '../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const db = context.env.DB
        const params = new URL(context.request.url).searchParams
        const ownership = params.get('ownership')
        const platform = params.get('platform')
        if (ownership && ownership !== 'all' && !isSiteOwnership(ownership)) return json(null, 400, '网站归属筛选无效')
        if (platform && platform !== 'all' && !['WordPress', 'Astro', 'Next.js', '其他'].includes(platform)) return json(null, 400, '网站技术栈筛选无效')
        const conditions: string[] = []
        const values: string[] = []
        if (ownership && ownership !== 'all') { conditions.push('ownership = ?'); values.push(ownership) }
        if (platform && platform !== 'all') { conditions.push('platform = ?'); values.push(platform) }
        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
        const todayParam = params.get('today')
        const today = todayParam && isValidDate(todayParam) ? todayParam : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        const [{ results: totals }, { results: seo }, { results: clicks }, { results: providers }, { results: ownerIncome }, { results: platforms }, { results: quality }] = await Promise.all([
            db.prepare(`SELECT COUNT(*) AS total_domains,
                SUM(CASE WHEN expiry_date >= ? AND expiry_date <= date(?, '+30 day') THEN 1 ELSE 0 END) AS expiring_domains,
                SUM(CASE WHEN seo_last_date IS NULL OR julianday(?) - julianday(seo_last_date) > 30 THEN 1 ELSE 0 END) AS seo_stale_domains,
                SUM(CASE WHEN platform = 'WordPress' AND (daily_clicks_range IN ('30to49', '50to99', 'over100') OR (daily_clicks_range IS NULL AND daily_clicks >= 30)) THEN 1 ELSE 0 END) AS excellent_wordpress,
                SUM(CASE WHEN platform = 'Astro' AND (daily_clicks_range IN ('30to49', '50to99', 'over100') OR (daily_clicks_range IS NULL AND daily_clicks >= 30)) THEN 1 ELSE 0 END) AS excellent_astro,
                SUM(CASE WHEN platform = 'Next.js' AND (daily_clicks_range IN ('30to49', '50to99', 'over100') OR (daily_clicks_range IS NULL AND daily_clicks >= 30)) THEN 1 ELSE 0 END) AS excellent_nextjs,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM domain_resources dr WHERE dr.domain_id = domains.id) THEN 1 ELSE 0 END) AS incomplete_resources
                FROM domains${where}`).bind(today, today, today, ...values).all(),
            db.prepare(`SELECT id, domain, seo_last_date,
                CAST(julianday(?) - julianday(seo_last_date) AS INTEGER) AS days_since
                FROM domains${where}
                ORDER BY seo_last_date ASC LIMIT 5`).bind(today, ...values).all(),
            db.prepare(`SELECT
                SUM(CASE WHEN daily_clicks_range IS NULL AND daily_clicks IS NULL THEN 1 ELSE 0 END) AS unknown,
                SUM(CASE WHEN daily_clicks_range = 'under10' OR (daily_clicks_range IS NULL AND daily_clicks < 10) THEN 1 ELSE 0 END) AS under_10,
                SUM(CASE WHEN daily_clicks_range = '10to29' OR (daily_clicks_range IS NULL AND daily_clicks BETWEEN 10 AND 29) THEN 1 ELSE 0 END) AS from_10_to_29,
                SUM(CASE WHEN daily_clicks_range = '30to49' OR (daily_clicks_range IS NULL AND daily_clicks BETWEEN 30 AND 49) THEN 1 ELSE 0 END) AS from_30_to_49,
                SUM(CASE WHEN daily_clicks_range = '50to99' OR (daily_clicks_range IS NULL AND daily_clicks BETWEEN 50 AND 99) THEN 1 ELSE 0 END) AS from_50_to_99,
                SUM(CASE WHEN daily_clicks_range = 'over100' OR (daily_clicks_range IS NULL AND daily_clicks >= 100) THEN 1 ELSE 0 END) AS over_100
                FROM domains${where}`).bind(...values).all(),
            db.prepare(`WITH providers(provider) AS (VALUES ('github'), ('cloudflare'), ('vhost'), ('vps')),
                account_counts AS (SELECT provider, COUNT(*) AS account_count FROM provider_accounts GROUP BY provider),
                resource_counts AS (SELECT r.provider, COUNT(DISTINCT r.id) AS resource_count,
                    COUNT(DISTINCT dr.domain_id) AS linked_domain_count
                    FROM provider_resources r LEFT JOIN domain_resources dr ON dr.resource_id = r.id GROUP BY r.provider)
                SELECT p.provider, COALESCE(a.account_count, 0) AS account_count,
                    COALESCE(r.resource_count, 0) AS resource_count, COALESCE(r.linked_domain_count, 0) AS linked_domain_count
                FROM providers p LEFT JOIN account_counts a ON a.provider = p.provider
                LEFT JOIN resource_counts r ON r.provider = p.provider ORDER BY p.provider`).all(),
            db.prepare(`WITH account_totals AS (
                    SELECT a.id, a.owner, a.opened_date,
                        COALESCE((SELECT SUM(CASE WHEN i.amount_usd = 0 AND i.amount <> 0 THEN i.amount ELSE i.amount_usd END)
                            FROM adsense_income i WHERE i.adsense_account_id = a.id), 0) AS income_usd_total,
                        (SELECT SUM(i.amount_cny) FROM adsense_income i WHERE i.adsense_account_id = a.id) AS income_cny_total
                    FROM adsense_accounts a
                ), owner_totals AS (
                    SELECT owner, COUNT(*) AS account_count,
                        SUM(income_usd_total) AS income_usd_total,
                        SUM(income_cny_total) AS income_cny_total,
                        MIN(opened_date) AS opened_date
                    FROM account_totals GROUP BY owner
                ), site_totals AS (
                    SELECT a.owner, COUNT(DISTINCT d.id) AS site_count
                    FROM adsense_accounts a LEFT JOIN domains d ON d.adsense_account_id = a.id
                    GROUP BY a.owner
                )
                SELECT o.owner, 'USD' AS currency, o.account_count,
                    COALESCE(o.income_usd_total, 0) AS income_usd_total,
                    o.income_cny_total, COALESCE(s.site_count, 0) AS site_count, o.opened_date
                FROM owner_totals o LEFT JOIN site_totals s ON s.owner = o.owner
                ORDER BY income_usd_total DESC, o.owner COLLATE NOCASE`).all()
            ,db.prepare(`SELECT platform, COUNT(*) AS count FROM domains${where} GROUP BY platform ORDER BY platform`).bind(...values).all(),
            db.prepare(`SELECT
                SUM(CASE WHEN d.adsense_connected = '已开通' AND d.adsense_account_id IS NULL THEN 1 ELSE 0 END) AS adsense_missing_account,
                SUM(CASE WHEN d.adsense_connected = '已开通' AND (d.adsense_opened_date IS NULL OR d.adsense_opened_date = '') THEN 1 ELSE 0 END) AS adsense_missing_date,
                SUM(CASE WHEN d.platform = 'WordPress' AND (d.wp_calculator_count IS NULL OR d.wp_article_count IS NULL OR d.content_stats_updated_date IS NULL) THEN 1 ELSE 0 END) AS wordpress_stats_incomplete,
                SUM(CASE WHEN d.platform IS NULL OR d.platform = '' THEN 1 ELSE 0 END) AS platform_missing,
                SUM(CASE WHEN d.daily_clicks IS NOT NULL AND (d.clicks_updated_date IS NULL OR julianday(?) - julianday(d.clicks_updated_date) > 30) THEN 1 ELSE 0 END) AS clicks_stale,
                SUM(CASE WHEN d.last_status_check_at IS NULL OR julianday(?) - julianday(substr(d.last_status_check_at, 1, 10)) > 7 THEN 1 ELSE 0 END) AS status_stale,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM domain_operations o WHERE o.domain_id = d.id) OR julianday(?) - julianday((SELECT MAX(o.operation_date) FROM domain_operations o WHERE o.domain_id = d.id)) > 30 THEN 1 ELSE 0 END) AS operation_stale,
                (SELECT COUNT(*) FROM adsense_accounts a WHERE a.publisher_id IS NULL OR a.publisher_id = '') AS adsense_publisher_missing
                FROM domains d${where}`).bind(today, today, today, ...values).all()
        ])
        return json({ totals: totals?.[0] || {}, seo: seo || [], clicks: clicks?.[0] || {}, providers: providers || [], owner_income: ownerIncome || [], platforms: platforms || [], quality: quality?.[0] || {} })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取首页概览失败') }
}
