import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { getBatchDetail, validateBatchFields, batchStatuses } from '../../domain/batches'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const batchId = (context: EventContext<Env, any, any>) => Number(context.params.id)

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = batchId(context); if (!Number.isInteger(id) || id <= 0) return json(null, 400, '批次编号无效')
        const detail = await getBatchDetail(context.env.DB, id)
        return detail ? json(detail) : json(null, 404, '批次不存在')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取批次失败') }
}

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = batchId(context); const body = await context.request.json() as Record<string, unknown>
        const current = await context.env.DB.prepare('SELECT * FROM website_batches WHERE id=?').bind(id).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '批次不存在')
        const validation = validateBatchFields(body, current)
        if (validation) return json(null, 400, validation)
        const allowed = ['name', 'source', 'goal', 'hypothesis', 'status', 'review_conclusion', 'next_action']
        const entries = Object.entries(body).filter(([key]) => allowed.includes(key))
        if (!entries.length) return json(null, 400, '批次更新没有可用字段')
        if (body.status === '已归档') entries.push(['archived_at', new Date().toISOString()])
        const assignments = entries.map(([key]) => `${key}=?`).join(', ')
        const updated = await context.env.DB.prepare(`UPDATE website_batches SET ${assignments},updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *`).bind(...entries.map(([, value]) => value === '' ? null : value), id).first()
        return json(updated, 200, '批次已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '批次更新失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = batchId(context)
        if (!batchStatuses) return json(null, 400, '批次状态无效')
        const current = await context.env.DB.prepare('SELECT id FROM website_batches WHERE id=?').bind(id).first()
        if (!current) return json(null, 404, '批次不存在')
        const history = await context.env.DB.prepare('SELECT (SELECT COUNT(*) FROM website_batch_members WHERE batch_id=?) + (SELECT COUNT(*) FROM website_batch_reviews WHERE batch_id=?) AS count').bind(id, id).first<{ count: number }>()
        if (Number(history?.count) > 0) return json(null, 409, '有成员历史或复盘记录的批次只能归档')
        await context.env.DB.prepare('DELETE FROM website_batches WHERE id=?').bind(id).run()
        return json(null, 200, '批次已删除')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '批次删除失败') }
}
