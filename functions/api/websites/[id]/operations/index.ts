import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isValidDate, todayShanghaiDate } from '../../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const kinds = ['SEO', '内容', '技术', '其他']

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const rows = await context.env.DB.prepare('SELECT * FROM website_operations WHERE website_id=? ORDER BY operation_date DESC, id DESC').bind(context.params.id).all()
        return json(rows.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取操作记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id)
        if (!await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first()) return json(null, 404, '网站不存在')
        const body = await context.request.json() as { operation_date?: unknown; operation_kind?: unknown }
        const date = body.operation_date || todayShanghaiDate()
        if (!isValidDate(date) || !kinds.includes(String(body.operation_kind))) return json(null, 400, '操作日期或类型无效')
        const result = await context.env.DB.prepare('INSERT INTO website_operations (website_id, operation_date, operation_kind) VALUES (?, ?, ?) ON CONFLICT(website_id, operation_date, operation_kind) DO NOTHING RETURNING *')
            .bind(websiteId, date, body.operation_kind).first()
        if (result) return json(result, 201, '操作日期已记录')
        const existing = await context.env.DB.prepare('SELECT * FROM website_operations WHERE website_id=? AND operation_date=? AND operation_kind=?').bind(websiteId, date, body.operation_kind).first()
        return json(existing, 200, '当天该类型已记录')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '保存操作记录失败') }
}
