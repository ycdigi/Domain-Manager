import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { editWebsiteTask } from '../../../../domain/website-task-transitions'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
export const onRequestPut: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    try {
        const result = await editWebsiteTask(context.env.DB, Number(context.params.id), Number(context.params.task_id), await context.request.json())
        return json(result.data, result.status, result.message)
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '任务更新失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare('DELETE FROM website_tasks WHERE id=? AND website_id=? AND task_type <> \'SEO复查\'').bind(context.params.task_id, context.params.id).run()
        return result.meta.changes ? json(null, 200, '任务已删除') : json(null, 404, '任务不存在或不能直接删除复查任务')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '任务删除失败') }
}
