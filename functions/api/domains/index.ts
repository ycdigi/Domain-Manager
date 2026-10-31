import { Env, Domain } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain, todayShanghaiDate } from '../../utils/domain-validation'

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkAuth(context)
        if (authError) return authError
        if (!context.env.DB) {
            throw new Error('Cloudflare D1 binding "DB" 未配置')
        }

        const result = await context.env.DB.prepare(`
            SELECT d.*,
                   (SELECT COUNT(*) FROM domain_resources dr WHERE dr.domain_id = d.id) AS resource_count,
                   (SELECT GROUP_CONCAT(label, ', ') FROM (
                       SELECT DISTINCT r.provider || ': ' || COALESCE(a.name || ' / ', '') || r.name AS label
                       FROM domain_resources dr JOIN provider_resources r ON r.id = dr.resource_id
                       LEFT JOIN provider_accounts a ON a.id = r.account_id WHERE dr.domain_id = d.id
                   )) AS resource_names,
                   (SELECT COUNT(*) FROM domain_ai_notes n WHERE n.domain_id = d.id AND n.archived_at IS NULL) AS ai_note_count,
                   CASE WHEN EXISTS (SELECT 1 FROM domain_resources dr WHERE dr.domain_id = d.id) THEN '已关联' ELSE '未关联' END AS resource_status
            FROM domains d ORDER BY d.created_at DESC
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
        const validationError = validateDomain(data)
        if (validationError) return Response.json({ status: 400, message: validationError, data: null }, { status: 400 })
        const normalizedDomain = normalizeDomain(data.domain)
        const existing = await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ? LIMIT 1").bind(normalizedDomain).first()
        if (existing) return Response.json({ status: 409, message: '该域名已存在', data: null }, { status: 409 })
        if (data.adsense_account_id != null) {
            const account = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id = ?').bind(data.adsense_account_id).first()
            if (!account) return Response.json({ status: 400, message: 'AdSense 账号不存在', data: null }, { status: 400 })
        }

        const result = await context.env.DB.prepare(`
            INSERT INTO domains (
                domain, registrar, registrar_link, registrar_date,
                expiry_date, service_type, status, tgsend, st_tgsend, memo,
                adsense_account_id, adsense_connected, adsense_opened_date, seo_last_date,
                daily_clicks, clicks_updated_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `).bind(
            normalizedDomain,
            data.registrar,
            data.registrar_link || '',
            data.registrar_date,
            data.expiry_date,
            data.service_type,
            data.status,
            data.tgsend || 0,
            data.st_tgsend ?? 1,
            data.memo || '',
            data.adsense_account_id ?? null,
            data.adsense_connected || '未知',
            data.adsense_opened_date || null,
            data.seo_last_date || null,
            data.daily_clicks ?? null,
            data.daily_clicks == null ? null : (data.clicks_updated_date || todayShanghaiDate())
        ).run<Domain>()

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
        console.error('创建域名失败:', error)
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '创建域名失败',
            data: null
        }, { status: 500 })
    }
}
