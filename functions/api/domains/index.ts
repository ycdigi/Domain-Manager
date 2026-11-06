import { Env, Domain } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain } from '../../utils/domain-validation'
import { prepareWebsiteChange, websiteWrite, seoTodayWrite, WebsiteChangeError } from '../../domain/website-changes'

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkAuth(context)
        if (authError) return authError
        if (!context.env.DB) {
            throw new Error('Cloudflare D1 binding "DB" 未配置')
        }

        const result = await context.env.DB.prepare(`
            SELECT d.*,
                   a.name AS adsense_account_name,
                   a.owner AS adsense_owner,
                   a.publisher_id AS adsense_publisher_id,
                   CASE WHEN d.adsense_opened_date IS NOT NULL AND d.registrar_date IS NOT NULL AND d.adsense_opened_date >= d.registrar_date
                        THEN CAST(julianday(d.adsense_opened_date) - julianday(d.registrar_date) AS INTEGER)
                        ELSE NULL END AS adsense_open_days,
                   (SELECT SUM(x.amount_usd) FROM adsense_income_domains x WHERE x.domain_id = d.id) AS adsense_income_usd,
                   (SELECT COUNT(*) FROM adsense_income_domains x WHERE x.domain_id = d.id) AS adsense_income_detail_count,
                   (SELECT COUNT(*) FROM domain_resources dr WHERE dr.domain_id = d.id) AS resource_count,
                   (SELECT GROUP_CONCAT(label, ', ') FROM (
                       SELECT DISTINCT r.provider || ': ' || COALESCE(a.name || ' / ', '') || r.name AS label
                       FROM domain_resources dr JOIN provider_resources r ON r.id = dr.resource_id
                       LEFT JOIN provider_accounts a ON a.id = r.account_id WHERE dr.domain_id = d.id
                   )) AS resource_names,
                   (SELECT COUNT(*) FROM domain_ai_notes n WHERE n.domain_id = d.id AND n.archived_at IS NULL) AS ai_note_count,
                   (SELECT MAX(o.operation_date) FROM domain_operations o WHERE o.domain_id = d.id) AS latest_operation_date,
                   (SELECT COUNT(*) FROM domain_operations o WHERE o.domain_id = d.id) AS operation_count,
                   CASE WHEN EXISTS (SELECT 1 FROM domain_resources dr WHERE dr.domain_id = d.id) THEN '已关联' ELSE '未关联' END AS resource_status
            FROM domains d
            LEFT JOIN adsense_accounts a ON a.id = d.adsense_account_id
            ORDER BY d.created_at DESC
        `).all<Domain>()

        if (!result.success) {
            throw new Error('数据库查询失败')
        }

        const response = {
            status: 200,
            message: '获取成功',
            data: result.results || []
        }

        return Response.json(response)
    } catch (error) {
        console.error('获取域名列表失败:', error)
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '获取域名列表失败',
            data: []
        }, { status: 500 })
    }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkAuth(context)
        if (authError) return authError
        if (!context.env.DB) {
            throw new Error('Cloudflare D1 binding "DB" 未配置')
        }

        const data = await context.request.json() as Domain
        const change = prepareWebsiteChange(null, data as unknown as Record<string, unknown>, 'create')
        const normalizedDomain = normalizeDomain(data.domain)
        const existing = await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ? LIMIT 1").bind(normalizedDomain).first()
        if (existing) return Response.json({ status: 409, message: '该域名已存在', data: null }, { status: 409 })
        if (data.adsense_account_id != null) {
            const account = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id = ?').bind(data.adsense_account_id).first()
            if (!account) return Response.json({ status: 400, message: 'AdSense 账号不存在', data: null }, { status: 400 })
        }

        const result = change.seoToday
            ? (await context.env.DB.batch([websiteWrite(context.env.DB, change), seoTodayWrite(context.env.DB, change.record.domain, change.record.seo_last_date!)]))[0]
            : await websiteWrite(context.env.DB, change).run<Domain>()

        if (result.success) {
            const newDomain = result.results?.[0] || null
            return Response.json({
                status: 200,
                message: '创建成功',
                data: newDomain
            })
        } else {
            throw new Error('数据库插入失败')
        }
    } catch (error) {
        if (error instanceof WebsiteChangeError) return Response.json({ status: 400, message: error.message, data: null }, { status: 400 })
        console.error('创建域名失败:', error)
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '创建域名失败',
            data: null
        }, { status: 500 })
    }
}
