import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isValidDate, todayShanghaiDate } from '../../../../utils/domain-validation'
import { addDays, ensureSeoReview, taskStatuses, validateWindow } from '../../../../domain/website-tasks'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const allowed = new Set(['title', 'description', 'status', 'due_at', 'completed_at', 'completion_summary', 'result_url', 'review_delay_days', 'review_window_days'])

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        const entries = Object.entries(body)
        if (!entries.length || entries.some(([key]) => !allowed.has(key))) return json(null, 400, '任务更新包含不支持的字段')
        if (body.status !== undefined && !taskStatuses.includes(body.status as typeof taskStatuses[number])) return json(null, 400, '任务状态无效')
        if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200)) return json(null, 400, '任务标题必填且不能超过 200 个字符')
        if (body.description != null && (typeof body.description !== 'string' || body.description.length > 5000)) return json(null, 400, '任务描述不能超过 5000 个字符')
        if (body.completion_summary != null && (typeof body.completion_summary !== 'string' || body.completion_summary.length > 5000)) return json(null, 400, '完成摘要不能超过 5000 个字符')
        if (body.result_url != null) {
            try { const url = new URL(String(body.result_url)); if (!['http:', 'https:'].includes(url.protocol) || String(body.result_url).length > 2000) return json(null, 400, '结果链接必须是 HTTP 或 HTTPS 地址') }
            catch { return json(null, 400, '结果链接必须是 HTTP 或 HTTPS 地址') }
        }
        if (body.review_delay_days !== undefined && (!Number.isInteger(body.review_delay_days) || Number(body.review_delay_days) < 28 || Number(body.review_delay_days) > 3650)) return json(null, 400, '复查等待天数必须为 28 到 3650 天')
        if (body.review_window_days !== undefined && (!Number.isInteger(body.review_window_days) || Number(body.review_window_days) < 1 || Number(body.review_window_days) > 365)) return json(null, 400, '点击窗口必须为 1 到 365 天')
        for (const key of ['due_at', 'completed_at']) if (body[key] != null && !isValidDate(body[key])) return json(null, 400, '任务日期无效')
        const db = context.env.DB
        const id = Number(context.params.id); const taskId = Number(context.params.task_id)
        const current = await db.prepare('SELECT * FROM website_tasks WHERE id=? AND website_id=?').bind(taskId, id).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '任务不存在')
        if (current.task_type === 'SEO复查' && body.status !== undefined) return json(null, 400, '复查任务状态由实际点击数据和复查结论控制')
        if (current.task_type === 'SEO' && Number(body.review_delay_days ?? current.review_delay_days) < Number(body.review_window_days ?? current.review_window_days)) return json(null, 400, '等待天数不能短于修改后点击窗口')
        if (body.completed_at != null && String(body.completed_at) > todayShanghaiDate()) return json(null, 400, '完成日期不能在未来')
        if (current.task_type === 'SEO复查' && body.due_at !== undefined) {
            const parent = await db.prepare('SELECT completed_at, review_delay_days FROM website_tasks WHERE id=? AND website_id=?').bind(current.review_of_task_id, id).first<{ completed_at: string; review_delay_days: number }>()
            if (!parent || !isValidDate(body.due_at) || body.due_at < addDays(parent.completed_at, Math.max(28, parent.review_delay_days))) return json(null, 400, '复查日期不能早于 SEO 完成后的等待期')
        }
        if (body.review_window_days !== undefined) {
            const snapshots = await db.prepare('SELECT period_start, period_end, clicks FROM website_click_snapshots WHERE task_id=?').bind(taskId).all<{ period_start: string; period_end: string; clicks: number }>()
            if ((snapshots.results || []).some(snapshot => validateWindow(snapshot, Number(body.review_window_days)))) return json(null, 400, '已有快照与新的对比窗口长度不一致')
        }
        if (current.task_type === 'SEO' && current.completed_at && ['completed_at', 'review_delay_days', 'review_window_days'].some(key => body[key] !== undefined && body[key] !== current[key])) return json(null, 400, 'SEO 完成后的复查基准已固定，请在复查任务调整日期')
        const changes = entries.map(([key, value]) => [key, value === '' ? null : value] as const)
        if (body.status === '已完成' && !body.completed_at && !current.completed_at) changes.push(['completed_at', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())])
        changes.push(['updated_at', new Date().toISOString()])
        const updated = await db.prepare(`UPDATE website_tasks SET ${changes.map(([key]) => `${key}=?`).join(', ')} WHERE id=? AND website_id=? RETURNING *`).bind(...changes.map(([, value]) => value), taskId, id).first<Record<string, unknown>>()

        if (updated?.task_type === 'SEO' && updated.status === '已完成') await ensureSeoReview(db, { id: taskId, website_id: id, title: String(updated.title), completed_at: String(updated.completed_at || ''), review_delay_days: Number(updated.review_delay_days), review_window_days: Number(updated.review_window_days) })
        return json(updated, 200, '任务已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '任务更新失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare('DELETE FROM website_tasks WHERE id=? AND website_id=? AND task_type <> \'SEO复查\'').bind(context.params.task_id, context.params.id).run()
        return result.meta.changes ? json(null, 200, '任务已删除') : json(null, 404, '任务不存在或不能直接删除复查任务')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '任务删除失败') }
}
