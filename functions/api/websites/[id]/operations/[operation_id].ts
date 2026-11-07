import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare('DELETE FROM website_operations WHERE id=? AND website_id=?').bind(context.params.operation_id, context.params.id).run()
        return result.meta.changes ? json(null, 200, '操作记录已删除') : json(null, 404, '操作记录不存在')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '删除操作记录失败') }
}
