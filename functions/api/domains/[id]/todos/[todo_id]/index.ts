import type { Env } from '../../../../../types'
import { checkAuth } from '../../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare('DELETE FROM domain_todos WHERE id = ? AND domain_id = ?').bind(context.params.todo_id, context.params.id).run()
        if (!result.meta.changes) return json(null, 404, 'Todo 不存在')
        return json(null, 200, 'Todo 已删除')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '删除 Todo 失败') }
}
