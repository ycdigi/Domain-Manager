import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { getBatchMemberRows } from '../../../domain/batches'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const idOf = (context: EventContext<Env, any, any>) => Number(context.params.id)
const idsOf = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 200 && value.every(id => Number.isSafeInteger(id) && Number(id) > 0) ? [...new Set(value as number[])] : null

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try { const batchId = idOf(context); if (!await context.env.DB.prepare('SELECT id FROM website_batches WHERE id=?').bind(batchId).first()) return json(null, 404, '批次不存在'); return json(await getBatchMemberRows(context.env.DB, batchId)) }
    catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取批次成员失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const batchId = idOf(context); const body = await context.request.json() as Record<string, unknown>; const ids = idsOf(body.website_ids)
        if (!ids) return json(null, 400, '网站编号必须是 1 到 200 个正整数')
        if (!await context.env.DB.prepare('SELECT id FROM website_batches WHERE id=?').bind(batchId).first()) return json(null, 404, '批次不存在')
        const sites = await context.env.DB.prepare(`SELECT id FROM websites WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: number }>()
        if ((sites.results || []).length !== ids.length) return json(null, 404, '部分网站不存在')
        const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null
        await context.env.DB.batch(ids.map(websiteId => context.env.DB.prepare(`INSERT INTO website_batch_members (batch_id,website_id,member_note,membership_status) VALUES (?,?,?,'active')
            ON CONFLICT(batch_id,website_id,membership_status) DO UPDATE SET member_note=excluded.member_note,removed_at=NULL,removed_reason=NULL`).bind(batchId, websiteId, note)))
        await context.env.DB.prepare("UPDATE website_batches SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='已复盘'").bind(batchId).run()
        return json(await getBatchMemberRows(context.env.DB, batchId), 200, '批次成员已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '加入批次失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const batchId = idOf(context); const body = await context.request.json() as Record<string, unknown>; const ids = idsOf(body.website_ids)
        if (!ids) return json(null, 400, '网站编号必须是 1 到 200 个正整数')
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null
        const now = new Date().toISOString()
        await context.env.DB.prepare(`UPDATE website_batch_members SET membership_status='removed',removed_at=?,removed_reason=? WHERE batch_id=? AND membership_status='active' AND website_id IN (${ids.map(() => '?').join(',')})`).bind(now, reason, batchId, ...ids).run()
        return json(await getBatchMemberRows(context.env.DB, batchId), 200, '批次成员已移出')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '移出批次失败') }
}
