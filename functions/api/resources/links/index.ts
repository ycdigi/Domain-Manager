import type { Env, DomainResourceLink } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { bindingWrite, primaryClearWrite, ResourceBindingError, resolveBindingResource } from '../../../domain/resource-bindings'

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
        const resource = await resolveBindingResource(context.env.DB, { domainId: data.domain_id as number, resourceId: data.resource_id, accountId: data.account_id, role: data.role || '', isPrimary: data.is_primary, memo: data.memo })
        const statements = [] as D1PreparedStatement[]
        if (data.is_primary) statements.push(primaryClearWrite(context.env.DB, data.domain_id as number))
        statements.push(bindingWrite(context.env.DB, { domainId: data.domain_id as number, role: data.role || '', isPrimary: data.is_primary, memo: data.memo }, resource.id))
        const result = await context.env.DB.batch(statements)
        return json(result[result.length - 1]?.results?.[0] || null, 201, '资源关联成功')
    } catch (error) {
        if (error instanceof ResourceBindingError) return json(null, 400, error.message)
        return json(null, 409, error instanceof Error ? error.message : '资源关联失败')
    }
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
