import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { isValidDate } from '../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const db = context.env.DB
        const params = new URL(context.request.url).searchParams
        const todayParam = params.get('today')
        const today = todayParam && isValidDate(todayParam) ? todayParam : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        const monthParam = params.get('month')
        const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7)
        const [{ results: totals }, { results: seo }, { results: clicks }, { results: providers }, { results: ownerIncome }, { results: platforms }, { results: quality }] = await Promise.all([
            db.prepare(`SELECT COUNT(*) AS total_domains,
                SUM(CASE WHEN expiry_date <= date(?, '+30 day') THEN 1 ELSE 0 END) AS expiring_domains,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM domain_resources dr WHERE dr.domain_id = domains.id) THEN 1 ELSE 0 END) AS incomplete_resources
                FROM domains`).bind(today).all(),
            db.prepare(`SELECT id, domain, seo_last_date,
                CAST(julianday(?) - julianday(seo_last_date) AS INTEGER) AS days_since
                FROM domains
                ORDER BY seo_last_date ASC LIMIT 5`).bind(today).all(),
            db.prepare(`SELECT
                SUM(CASE WHEN daily_clicks IS NULL THEN 1 ELSE 0 END) AS unknown,
                SUM(CASE WHEN daily_clicks < 10 THEN 1 ELSE 0 END) AS under_10,
                SUM(CASE WHEN daily_clicks BETWEEN 10 AND 29 THEN 1 ELSE 0 END) AS from_10_to_29,
                SUM(CASE WHEN daily_clicks BETWEEN 30 AND 49 THEN 1 ELSE 0 END) AS from_30_to_49,
                SUM(CASE WHEN daily_clicks BETWEEN 50 AND 99 THEN 1 ELSE 0 END) AS from_50_to_99,
                SUM(CASE WHEN daily_clicks >= 100 THEN 1 ELSE 0 END) AS over_100
                FROM domains`).all(),
            db.prepare(`WITH providers(provider) AS (VALUES ('github'), ('cloudflare'), ('vhost'), ('vps')),
                account_counts AS (SELECT provider, COUNT(*) AS account_count FROM provider_accounts GROUP BY provider),
                resource_counts AS (SELECT r.provider, COUNT(DISTINCT r.id) AS resource_count,
                    COUNT(DISTINCT dr.domain_id) AS linked_domain_count
                    FROM provider_resources r LEFT JOIN domain_resources dr ON dr.resource_id = r.id GROUP BY r.provider)
                SELECT p.provider, COALESCE(a.account_count, 0) AS account_count,
                    COALESCE(r.resource_count, 0) AS resource_count, COALESCE(r.linked_domain_count, 0) AS linked_domain_count
                FROM providers p LEFT JOIN account_counts a ON a.provider = p.provider
                LEFT JOIN resource_counts r ON r.provider = p.provider ORDER BY p.provider`).all(),
            db.prepare(`SELECT a.owner, a.currency, COUNT(DISTINCT a.id) AS account_count,
                COALESCE(SUM(i.amount), 0) AS current_income
                FROM adsense_accounts a
                LEFT JOIN adsense_income i ON i.adsense_account_id = a.id AND i.income_month = ?
                GROUP BY a.owner, a.currency ORDER BY current_income DESC, a.owner COLLATE NOCASE`).bind(month).all()
            ,db.prepare(`SELECT platform, COUNT(*) AS count FROM domains GROUP BY platform ORDER BY platform`).all(),
            db.prepare(`SELECT
                SUM(CASE WHEN d.adsense_connected = '已开通' AND d.adsense_account_id IS NULL THEN 1 ELSE 0 END) AS adsense_missing_account,
                SUM(CASE WHEN d.adsense_connected = '已开通' AND (d.adsense_opened_date IS NULL OR d.adsense_opened_date = '') THEN 1 ELSE 0 END) AS adsense_missing_date,
                SUM(CASE WHEN d.platform = 'WordPress' AND (d.wp_calculator_count IS NULL OR d.wp_article_count IS NULL OR d.content_stats_updated_date IS NULL) THEN 1 ELSE 0 END) AS wordpress_stats_incomplete,
                SUM(CASE WHEN d.platform IS NULL OR d.platform = '' THEN 1 ELSE 0 END) AS platform_missing,
                SUM(CASE WHEN d.daily_clicks IS NOT NULL AND (d.clicks_updated_date IS NULL OR julianday(?) - julianday(d.clicks_updated_date) > 30) THEN 1 ELSE 0 END) AS clicks_stale,
                SUM(CASE WHEN d.last_status_check_at IS NULL OR julianday(?) - julianday(substr(d.last_status_check_at, 1, 10)) > 7 THEN 1 ELSE 0 END) AS status_stale,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM domain_operations o WHERE o.domain_id = d.id) OR julianday(?) - julianday((SELECT MAX(o.operation_date) FROM domain_operations o WHERE o.domain_id = d.id)) > 30 THEN 1 ELSE 0 END) AS operation_stale,
                (SELECT COUNT(*) FROM adsense_accounts a WHERE a.publisher_id IS NULL OR a.publisher_id = '') AS adsense_publisher_missing
                FROM domains d`).bind(today, today, today).all()
        ])
        return json({ totals: totals?.[0] || {}, seo: seo || [], clicks: clicks?.[0] || {}, providers: providers || [], owner_income: ownerIncome || [], platforms: platforms || [], quality: quality?.[0] || {} })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取首页概览失败') }
}
