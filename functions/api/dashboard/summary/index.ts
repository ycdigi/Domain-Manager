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
        const todayParam = params.get('today')
        const today = todayParam && isValidDate(todayParam) ? todayParam : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        const conditions: string[] = []
        const values: string[] = []
        if (ownership && ownership !== 'all') { conditions.push('w.ownership=?'); values.push(ownership) }
        if (platform && platform !== 'all') { conditions.push('w.platform=?'); values.push(platform) }
        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
        const [{ results: totals }, { results: seo }, { results: clicks }, { results: providers }, { results: ownerIncome }, { results: platforms }, { results: quality }] = await Promise.all([
            db.prepare(`SELECT COUNT(*) AS total_websites,
                SUM(CASE WHEN EXISTS (SELECT 1 FROM domains d WHERE d.website_id=w.id AND d.expiry_date>=? AND d.expiry_date<=date(?, '+30 day')) THEN 1 ELSE 0 END) AS expiring_websites,
                SUM(CASE WHEN w.seo_last_date IS NULL OR julianday(?) - julianday(w.seo_last_date)>30 THEN 1 ELSE 0 END) AS seo_stale_websites,
                SUM(CASE WHEN w.platform='WordPress' AND (w.daily_clicks_range IN ('30to49','50to99','over100') OR (w.daily_clicks_range IS NULL AND w.daily_clicks>=30)) THEN 1 ELSE 0 END) AS excellent_wordpress,
                SUM(CASE WHEN w.platform='Astro' AND (w.daily_clicks_range IN ('30to49','50to99','over100') OR (w.daily_clicks_range IS NULL AND w.daily_clicks>=30)) THEN 1 ELSE 0 END) AS excellent_astro,
                SUM(CASE WHEN w.platform='Next.js' AND (w.daily_clicks_range IN ('30to49','50to99','over100') OR (w.daily_clicks_range IS NULL AND w.daily_clicks>=30)) THEN 1 ELSE 0 END) AS excellent_next,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM website_resources wr WHERE wr.website_id=w.id) THEN 1 ELSE 0 END) AS incomplete_resources
                FROM websites w${where}`).bind(today, today, today, ...values).all(),
            db.prepare(`SELECT w.id, w.name, w.seo_last_date, CAST(julianday(?) - julianday(w.seo_last_date) AS INTEGER) AS days_since FROM websites w${where} ORDER BY w.seo_last_date ASC LIMIT 5`).bind(today, ...values).all(),
            db.prepare(`SELECT SUM(CASE WHEN w.daily_clicks_range IS NULL AND w.daily_clicks IS NULL THEN 1 ELSE 0 END) AS unknown,
                SUM(CASE WHEN w.daily_clicks_range='under10' OR (w.daily_clicks_range IS NULL AND w.daily_clicks<10) THEN 1 ELSE 0 END) AS under_10,
                SUM(CASE WHEN w.daily_clicks_range='10to29' OR (w.daily_clicks_range IS NULL AND w.daily_clicks BETWEEN 10 AND 29) THEN 1 ELSE 0 END) AS from_10_to_29,
                SUM(CASE WHEN w.daily_clicks_range='30to49' OR (w.daily_clicks_range IS NULL AND w.daily_clicks BETWEEN 30 AND 49) THEN 1 ELSE 0 END) AS from_30_to_49,
                SUM(CASE WHEN w.daily_clicks_range='50to99' OR (w.daily_clicks_range IS NULL AND w.daily_clicks BETWEEN 50 AND 99) THEN 1 ELSE 0 END) AS from_50_to_99,
                SUM(CASE WHEN w.daily_clicks_range='over100' OR (w.daily_clicks_range IS NULL AND w.daily_clicks>=100) THEN 1 ELSE 0 END) AS over_100 FROM websites w${where}`).bind(...values).all(),
            db.prepare(`WITH providers(provider) AS (VALUES ('github'),('cloudflare'),('vhost'),('vps')), accounts AS (SELECT provider, COUNT(*) AS account_count FROM provider_accounts GROUP BY provider), resources AS (SELECT r.provider, COUNT(DISTINCT CASE WHEN r.identifier IS NULL OR r.identifier NOT LIKE 'account:%' THEN r.id END) AS resource_count, COUNT(DISTINCT wr.website_id) AS linked_website_count FROM provider_resources r LEFT JOIN website_resources wr ON wr.resource_id=r.id GROUP BY r.provider) SELECT p.provider, COALESCE(a.account_count,0) AS account_count, COALESCE(r.resource_count,0) AS resource_count, COALESCE(r.linked_website_count,0) AS linked_website_count FROM providers p LEFT JOIN accounts a ON a.provider=p.provider LEFT JOIN resources r ON r.provider=p.provider ORDER BY p.provider`).all(),
            db.prepare(`WITH account_totals AS (SELECT a.id,a.owner,a.opened_date,COALESCE((SELECT SUM(CASE WHEN i.amount_usd=0 AND i.amount<>0 THEN i.amount ELSE i.amount_usd END) FROM adsense_income i WHERE i.adsense_account_id=a.id),0) AS income_usd_total,(SELECT SUM(i.amount_cny) FROM adsense_income i WHERE i.adsense_account_id=a.id) AS income_cny_total FROM adsense_accounts a), owner_totals AS (SELECT owner,COUNT(*) AS account_count,SUM(income_usd_total) AS income_usd_total,SUM(income_cny_total) AS income_cny_total,MIN(opened_date) AS opened_date FROM account_totals GROUP BY owner), site_totals AS (SELECT a.owner,COUNT(DISTINCT w.id) AS site_count FROM adsense_accounts a LEFT JOIN websites w ON w.adsense_account_id=a.id GROUP BY a.owner) SELECT o.owner,'USD' AS currency,o.account_count,COALESCE(o.income_usd_total,0) AS income_usd_total,o.income_cny_total,COALESCE(s.site_count,0) AS site_count,o.opened_date FROM owner_totals o LEFT JOIN site_totals s ON s.owner=o.owner ORDER BY income_usd_total DESC,o.owner COLLATE NOCASE`).all(),
            db.prepare(`SELECT w.platform, COUNT(*) AS count FROM websites w${where} GROUP BY w.platform ORDER BY w.platform`).bind(...values).all(),
            db.prepare(`SELECT SUM(CASE WHEN w.adsense_connected='已开通' AND w.adsense_account_id IS NULL THEN 1 ELSE 0 END) AS adsense_missing_account, SUM(CASE WHEN w.adsense_connected='已开通' AND (w.adsense_opened_date IS NULL OR w.adsense_opened_date='') THEN 1 ELSE 0 END) AS adsense_missing_date, SUM(CASE WHEN w.platform='WordPress' AND (w.wp_calculator_count IS NULL OR w.wp_article_count IS NULL OR w.content_stats_updated_date IS NULL) THEN 1 ELSE 0 END) AS wordpress_stats_incomplete, SUM(CASE WHEN w.platform IS NULL OR w.platform='' THEN 1 ELSE 0 END) AS platform_missing, SUM(CASE WHEN w.daily_clicks IS NOT NULL AND (w.clicks_updated_date IS NULL OR julianday(?) - julianday(w.clicks_updated_date)>30) THEN 1 ELSE 0 END) AS clicks_stale, SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM domains d WHERE d.website_id=w.id AND d.last_status_check_at IS NOT NULL) OR julianday(?) - julianday((SELECT MAX(substr(d.last_status_check_at,1,10)) FROM domains d WHERE d.website_id=w.id))>7 THEN 1 ELSE 0 END) AS status_stale, SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM website_operations o WHERE o.website_id=w.id) OR julianday(?) - julianday((SELECT MAX(o.operation_date) FROM website_operations o WHERE o.website_id=w.id))>30 THEN 1 ELSE 0 END) AS operation_stale, (SELECT COUNT(*) FROM adsense_accounts a WHERE a.publisher_id IS NULL OR a.publisher_id='') AS adsense_publisher_missing FROM websites w${where}`).bind(today, today, today, ...values).all()
        ])
        return json({ totals: totals?.[0] || {}, seo: seo || [], clicks: clicks?.[0] || {}, providers: providers || [], owner_income: ownerIncome || [], platforms: platforms || [], quality: quality?.[0] || {} })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取首页概览失败') }
}
