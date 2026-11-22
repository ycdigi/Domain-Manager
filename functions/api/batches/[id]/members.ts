import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { getBatchMemberRows } from '../../../domain/batches'
import { idGroups } from '../../../domain/bulk-ids'

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
        const batchId = idOf(context); const body = await context.request.json() as Record<string, unknown>
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(null, 400, '成员设置格式无效')
        const ids = idsOf(body.website_ids)
        if (!ids) return json(null, 400, '网站编号必须是 1 到 200 个正整数')
        const batch = await context.env.DB.prepare('SELECT id,status FROM website_batches WHERE id=?').bind(batchId).first<{id:number;status:string}>()
        if (!batch) return json(null, 404, '批次不存在')
        if (batch.status==='已归档') return json(null,409,'已归档批次不可继续加入网站')
        if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500)) return json(null, 400, '成员备注不能超过 500 个字符')
        const groups = idGroups(ids)
        let existing = 0
        for (const group of groups) {
            const sites = await context.env.DB.prepare(`SELECT id FROM websites WHERE id IN (${group.map(() => '?').join(',')})`).bind(...group).all<{id:number}>()
            existing += (sites.results || []).length
        }
        if (existing !== ids.length) return json(null, 404, '部分网站不存在')
        const note = typeof body.note === 'string' ? body.note.trim() || null : null
        const writes = groups.map(group => context.env.DB.prepare(`INSERT INTO website_batch_members (batch_id,website_id,member_note,membership_status)
            SELECT ?,id,?,'active' FROM websites WHERE id IN (${group.map(() => '?').join(',')})
            ON CONFLICT(batch_id,website_id) WHERE membership_status='active' DO UPDATE SET member_note=CASE WHEN ?=1 THEN excluded.member_note ELSE website_batch_members.member_note END`).bind(batchId, note, ...group, body.note === undefined ? 0 : 1))
        writes.push(context.env.DB.prepare("UPDATE website_batches SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='已复盘'").bind(batchId))
        await context.env.DB.batch(writes)
        return json(await getBatchMemberRows(context.env.DB, batchId), 200, '批次成员已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '加入批次失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const batchId = idOf(context); const body = await context.request.json() as Record<string, unknown>
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(null, 400, '成员设置格式无效')
        const ids = idsOf(body.website_ids)
        if (!ids) return json(null, 400, '网站编号必须是 1 到 200 个正整数')
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null
        const now = new Date().toISOString()
        await context.env.DB.batch(idGroups(ids).map(group => context.env.DB.prepare(`UPDATE website_batch_members SET membership_status='removed',removed_at=?,removed_reason=? WHERE batch_id=? AND membership_status='active' AND website_id IN (${group.map(() => '?').join(',')})`).bind(now, reason, batchId, ...group)))
        return json(await getBatchMemberRows(context.env.DB, batchId), 200, '批次成员已移出')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '移出批次失败') }
}
