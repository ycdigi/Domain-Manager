import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { updateWebsite, WebsiteEditError } from '../../domain/website-edits'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        const result = await updateWebsite(context.env.DB, Number(context.params.id), body)
        return json(result, 200, '网站已更新')
    } catch (error) { return json(null, error instanceof WebsiteEditError ? error.status : 500, error instanceof Error ? error.message : '网站更新失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare('DELETE FROM websites WHERE id=?').bind(context.params.id).run()
        return result.meta.changes ? json(null, 200, '网站及其资料已删除') : json(null, 404, '网站不存在')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '网站删除失败') }
}
