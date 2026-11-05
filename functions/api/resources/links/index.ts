import type { Env, DomainResourceLink } from '../../../types'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const domainId = new URL(context.request.url).searchParams.get('domain_id')
        const sql = `SELECT dr.*, r.provider, r.name AS resource_name, r.resource_url, r.identifier, r.ip_address, r.port, r.region, r.status AS resource_status, a.id AS account_id, a.name AS account_name, a.login_email
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
        const data = await context.request.json() as Partial<DomainResourceLink> & { account_id?: number }
        if (!Number.isInteger(data.domain_id) || !data.role?.trim() || (!Number.isInteger(data.resource_id) && !Number.isInteger(data.account_id))) return json(null, 400, '网站、账号或资源和角色不能为空')
        let resourceId = data.resource_id
        if (!resourceId && data.account_id) {
            const account = await context.env.DB.prepare('SELECT id, provider, name FROM provider_accounts WHERE id = ?').bind(data.account_id).first<{ id: number; provider: string; name: string }>()
            if (!account) return json(null, 400, '服务商账号不存在')
            const existing = await context.env.DB.prepare("SELECT id FROM provider_resources WHERE account_id = ? AND identifier = ?").bind(account.id, `account:${account.id}`).first<{ id: number }>()
            if (existing) resourceId = existing.id
            else {
                const created = await context.env.DB.prepare(`INSERT INTO provider_resources (account_id, provider, name, identifier, status, memo) VALUES (?, ?, ?, ?, '正常', ?) RETURNING id`)
                    .bind(account.id, account.provider, `${account.name}（账号归属）`, `account:${account.id}`, '由账号绑定自动生成，可在后续补充具体 Pages、Zone 或服务器资源').run<{ id: number }>()
                resourceId = created.results?.[0]?.id
            }
        }
        const [domain, resource] = await Promise.all([
            context.env.DB.prepare('SELECT id FROM domains WHERE id = ?').bind(data.domain_id).first(),
            context.env.DB.prepare('SELECT id FROM provider_resources WHERE id = ?').bind(resourceId).first()
        ])
        if (!domain || !resource) return json(null, 400, '网站或资源不存在')
        if (data.is_primary) await context.env.DB.prepare('UPDATE domain_resources SET is_primary = 0 WHERE domain_id = ?').bind(data.domain_id).run()
        const result = await context.env.DB.prepare(`
            INSERT INTO domain_resources (domain_id, resource_id, role, is_primary, memo)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(domain_id, resource_id, role) DO UPDATE SET is_primary = excluded.is_primary, memo = excluded.memo
            RETURNING *
        `).bind(data.domain_id, resourceId, data.role.trim(), data.is_primary ? 1 : 0, data.memo || '').run<DomainResourceLink>()
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
