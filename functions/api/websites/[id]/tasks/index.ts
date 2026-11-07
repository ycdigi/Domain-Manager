import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isValidDate } from '../../../../utils/domain-validation'
import { insertSnapshot, taskTypes, validateWindow, websiteExists } from '../../../../domain/website-tasks'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare(`
            SELECT t.*, (SELECT json_group_array(json_object('period_kind', s.period_kind, 'period_start', s.period_start, 'period_end', s.period_end, 'clicks', s.clicks)) FROM website_click_snapshots s WHERE s.task_id=t.id) AS snapshots_json
            FROM website_tasks t WHERE t.website_id=? ORDER BY CASE WHEN t.status='已完成' THEN 1 ELSE 0 END, COALESCE(t.due_at, t.created_at), t.id DESC
        `).bind(context.params.id).all<Record<string, unknown>>()
        return json((result.results || []).map(row => ({ ...row, snapshots: JSON.parse(String(row.snapshots_json || '[]')), snapshots_json: undefined })))
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取任务失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id)
        if (!await websiteExists(context.env.DB, websiteId)) return json(null, 404, '网站不存在')
        const body = await context.request.json() as Record<string, unknown>
        const type = body.task_type
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        const description = typeof body.description === 'string' ? body.description.trim() : ''
        if (!taskTypes.includes(type as typeof taskTypes[number]) || type === 'SEO复查') return json(null, 400, '任务分类无效')
        if (!title || title.length > 200) return json(null, 400, '任务标题必填且不能超过 200 个字符')
        if (description.length > 5000) return json(null, 400, '任务描述不能超过 5000 个字符')
        const reviewDays = body.review_delay_days ?? 28
        const windowDays = body.review_window_days ?? 28
        if (!Number.isInteger(reviewDays) || Number(reviewDays) < 28 || Number(reviewDays) > 3650 || !Number.isInteger(windowDays) || Number(windowDays) < 1 || Number(windowDays) > 365) return json(null, 400, '复查间隔为 28 到 3650 天，窗口长度为 1 到 365 天')
        if (Number(reviewDays) < Number(windowDays)) return json(null, 400, '等待天数不能短于修改后点击窗口')
        if (body.due_at != null && !isValidDate(body.due_at)) return json(null, 400, '截止日期无效')
        if (body.baseline !== undefined) {
            const error = type !== 'SEO' ? '只有 SEO 任务可提供点击基线' : validateWindow(body.baseline as never, Number(windowDays))
            if (error) return json(null, 400, error)
        }
        const result = await context.env.DB.prepare(`
            INSERT INTO website_tasks (website_id, task_type, title, description, due_at, review_delay_days, review_window_days)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
        `).bind(websiteId, type, title, description || null, body.due_at || null, reviewDays, windowDays).run<Record<string, unknown>>()
        const task = result.results?.[0]
        if (task && body.baseline !== undefined) await insertSnapshot(context.env.DB, Number(task.id), 'before', body.baseline as never).run()
        return json(task || null, 201, '任务已创建')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '任务创建失败') }
}
