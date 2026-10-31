import type { Env, DomainResourceLink } from '../../../types'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const domainId = new URL(context.request.url).searchParams.get('domain_id')
        const sql = `SELECT dr.*, r.provider, r.name AS resource_name, r.resource_url, r.ip_address, r.status AS resource_status, a.id AS account_id, a.name AS account_name
                     FROM domain_resources dr
                     JOIN provider_resources r ON r.id = dr.resource_id
                     LEFT JOIN provider_accounts a ON a.id = r.account_id
                     ${domainId ? 'WHERE dr.domain_id = ?' : ''} ORDER BY r.provider, r.name`
        const result = domainId ? await context.env.DB.prepare(sql).bind(domainId).all() : await context.env.DB.prepare(sql).all()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取资源关联失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<DomainResourceLink>
        if (!Number.isInteger(data.domain_id) || !Number.isInteger(data.resource_id) || !data.role?.trim()) return json(null, 400, '网站、资源和角色不能为空')
        const [domain, resource] = await Promise.all([
            context.env.DB.prepare('SELECT id FROM domains WHERE id = ?').bind(data.domain_id).first(),
            context.env.DB.prepare('SELECT id FROM provider_resources WHERE id = ?').bind(data.resource_id).first()
        ])
        if (!domain || !resource) return json(null, 400, '网站或资源不存在')
        const result = await context.env.DB.prepare(`
            INSERT INTO domain_resources (domain_id, resource_id, role, is_primary, memo)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(domain_id, resource_id, role) DO UPDATE SET is_primary = excluded.is_primary, memo = excluded.memo
            RETURNING *
        `).bind(data.domain_id, data.resource_id, data.role.trim(), data.is_primary ? 1 : 0, data.memo || '').run<DomainResourceLink>()
        return json(result.results?.[0] || null, 201, '资源关联成功')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '资源关联失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = new URL(context.request.url).searchParams.get('id')
        if (!id) return json(null, 400, '缺少关联编号')
        await context.env.DB.prepare('DELETE FROM domain_resources WHERE id = ?').bind(id).run()
        return json(null, 200, '资源关联已解除')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '解除资源关联失败') }
}
