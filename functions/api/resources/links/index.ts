import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { bindingWrite, primaryClearWrite, ResourceBindingError, resolveBindingResource } from '../../../domain/resource-bindings'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = new URL(context.request.url).searchParams.get('website_id')
        const sql = `SELECT wr.*, w.name AS website_name, r.provider, r.name AS resource_name, r.resource_url, r.identifier, r.ip_address, r.port, r.region, r.status AS resource_status, a.id AS account_id, a.name AS account_name, a.login_email
                     FROM website_resources wr JOIN websites w ON w.id=wr.website_id
                     JOIN provider_resources r ON r.id = wr.resource_id
                     LEFT JOIN provider_accounts a ON a.id = r.account_id
                     ${websiteId ? 'WHERE wr.website_id = ?' : ''} ORDER BY r.provider, r.name`
        const result = websiteId ? await context.env.DB.prepare(sql).bind(websiteId).all() : await context.env.DB.prepare(sql).all()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取资源关联失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as { website_id?: number; resource_id?: number; account_id?: number; role?: string; is_primary?: boolean | number; memo?: string | null }
        const websiteId = data.website_id as number
        const input = { websiteId, resourceId: data.resource_id, accountId: data.account_id, role: data.role || '', isPrimary: data.is_primary, memo: data.memo }
        const resource = await resolveBindingResource(context.env.DB, input)
        const statements = [] as D1PreparedStatement[]
        if (data.is_primary) statements.push(primaryClearWrite(context.env.DB, websiteId))
        statements.push(bindingWrite(context.env.DB, input, resource.id))
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
        await context.env.DB.prepare('DELETE FROM website_resources WHERE id = ?').bind(id).run()
        return json(null, 200, '资源关联已解除')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '解除资源关联失败') }
}
