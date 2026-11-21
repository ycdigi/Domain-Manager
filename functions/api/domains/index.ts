import { cacheDomainFavicon } from '../../domain/favicons'
import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const params = new URL(context.request.url).searchParams
        const websiteId = params.get('website_id')
        if (websiteId && !/^[1-9]\d*$/.test(websiteId)) return json(null, 400, 'website_id 必须是正整数')
        if (websiteId && !await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first()) return json(null, 404, '网站不存在')
        const rows = await context.env.DB.prepare(`SELECT d.*, w.name AS website_name, w.stage AS website_stage
            FROM domains d LEFT JOIN websites w ON w.id=d.website_id
            ${websiteId ? 'WHERE d.website_id=?' : ''}
            ORDER BY w.id IS NULL, w.id, d.is_primary DESC, d.domain`)
            .bind(...(websiteId ? [websiteId] : [])).all()
        return json(rows.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取域名失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        const websiteId = body.website_id == null ? null : Number(body.website_id)
        if (websiteId !== null && (!Number.isInteger(websiteId) || !await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first())) return json(null, 404, '网站不存在')
        const domain = { ...body, status: body.status || '在线' }
        const validation = validateDomain(domain as never)
        if (validation) return json(null, 400, validation)
        if (!['主域名', '跳转域名', '备用域名'].includes(String(body.domain_role || '备用域名'))) return json(null, 400, '域名用途无效')
        const normalized = normalizeDomain(String(body.domain))
        if (await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.'))=?").bind(normalized).first()) return json(null, 409, '该域名已存在')
        if (body.domain_role === '主域名' && websiteId === null) return json(null,400,'主域名必须先关联网站')
        const firstDomain = websiteId !== null && !(await context.env.DB.prepare('SELECT id FROM domains WHERE website_id=? LIMIT 1').bind(websiteId).first())
        const isPrimary = websiteId !== null && (firstDomain || body.domain_role === '主域名' || body.is_primary === true || body.is_primary === 1)
        const writes: D1PreparedStatement[] = []
        if (isPrimary) writes.push(context.env.DB.prepare("UPDATE domains SET is_primary=0,domain_role=CASE WHEN domain_role='主域名' THEN '备用域名' ELSE domain_role END WHERE website_id=?").bind(websiteId))
        writes.push(context.env.DB.prepare(`INSERT INTO domains
            (website_id, domain, registrar, registrar_link, registrar_date, expiry_date, service_type, status, memo, domain_role, is_primary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
            .bind(websiteId, normalized, body.registrar, body.registrar_link || null, body.registrar_date, body.expiry_date, body.service_type, domain.status, body.memo || null, isPrimary ? '主域名' : body.domain_role || '备用域名', isPrimary ? 1 : 0))
        const results = await context.env.DB.batch(writes)
        const result = results[results.length - 1].results[0]
        if (context.waitUntil) context.waitUntil(cacheDomainFavicon(context.env.DB, Number((result as {id:number})?.id)))
        return json(result, 201, '域名已关联')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '添加域名失败') }
}
