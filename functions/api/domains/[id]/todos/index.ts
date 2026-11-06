import type { Env, DomainTodo } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare(`
            SELECT id, domain_id, title, description, created_at
            FROM domain_todos WHERE domain_id = ? ORDER BY created_at DESC, id DESC
        `).bind(context.params.id).all<DomainTodo>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 Todo 失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as { title?: unknown; description?: unknown }
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        const description = typeof body.description === 'string' ? body.description.trim() : ''
        if (!title || title.length > 200) return json(null, 400, 'Todo 标题不能为空且不能超过 200 个字符')
        if (description.length > 5000) return json(null, 400, 'Todo 描述不能超过 5000 个字符')
        const domain = await context.env.DB.prepare('SELECT id FROM domains WHERE id = ?').bind(context.params.id).first()
        if (!domain) return json(null, 404, '域名不存在')
        const result = await context.env.DB.prepare(`
            INSERT INTO domain_todos (domain_id, title, description) VALUES (?, ?, ?) RETURNING *
        `).bind(context.params.id, title, description || null).run<DomainTodo>()
        return json(result.results?.[0] || null, 201, 'Todo 已添加')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '保存 Todo 失败') }
}
