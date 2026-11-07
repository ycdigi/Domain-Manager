import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isValidDate } from '../../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const rows = await context.env.DB.prepare('SELECT * FROM website_effort WHERE website_id=? ORDER BY week_start DESC').bind(context.params.id).all()
        return json(rows.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取投入时间失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id)
        if (!await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first()) return json(null, 404, '网站不存在')
        const body = await context.request.json() as Record<string, unknown>
        if (!isValidDate(body.week_start) || new Date(`${body.week_start}T00:00:00Z`).getUTCDay() !== 1 || typeof body.hours !== 'number' || !Number.isFinite(body.hours) || body.hours < 0 || body.hours > 168) return json(null, 400, '周起始日期必须为周一，投入时间需为 0 到 168 小时')
        const result = await context.env.DB.prepare(`
            INSERT INTO website_effort (website_id, week_start, hours, memo) VALUES (?, ?, ?, ?)
            ON CONFLICT(website_id, week_start) DO UPDATE SET hours=excluded.hours, memo=excluded.memo
            RETURNING *
        `).bind(websiteId, body.week_start, body.hours, typeof body.memo === 'string' ? body.memo.slice(0, 2000) : null).first()
        return json(result, 201, '投入时间已保存')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '保存投入时间失败') }
}
