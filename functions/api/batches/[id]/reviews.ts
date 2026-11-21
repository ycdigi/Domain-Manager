import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { batchSnapshot, getBatchMemberRows } from '../../../domain/batches'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const idOf = (context: EventContext<Env, any, any>) => Number(context.params.id)
const decorate = (row: Record<string, unknown> | null) => row && ({ ...row, stage_counts: JSON.parse(String(row.stage_counts || '{}')), content_totals: JSON.parse(String(row.content_totals || '{}')) })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try { const id = idOf(context); if (!await context.env.DB.prepare('SELECT id FROM website_batches WHERE id=?').bind(id).first()) return json(null, 404, '批次不存在'); const rows = await context.env.DB.prepare('SELECT * FROM website_batch_reviews WHERE batch_id=? ORDER BY reviewed_at DESC,id DESC').bind(id).all<Record<string, unknown>>(); return json((rows.results || []).map(decorate)) }
    catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取复盘记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = idOf(context); const body = await context.request.json() as Record<string, unknown>; const current = await context.env.DB.prepare('SELECT * FROM website_batches WHERE id=?').bind(id).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '批次不存在')
        if (body.action === 'request') {
            const row = await context.env.DB.prepare("UPDATE website_batches SET status='待复盘',review_requested_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *").bind(new Date().toISOString(), id).first()
            return json(row, 200, '已请求复盘')
        }
        if (body.action !== 'complete') return json(null, 400, '复盘操作无效')
        const rows = (await getBatchMemberRows(context.env.DB, id)).filter(row => row.membership_status === 'active')
        const snapshot = batchSnapshot(rows)
        const review = await context.env.DB.prepare(`INSERT INTO website_batch_reviews (batch_id,member_count,stage_counts,content_totals,conclusion,next_action) VALUES (?,?,?,?,?,?) RETURNING *`).bind(id, snapshot.member_count,  JSON.stringify(snapshot.stage_counts), JSON.stringify(snapshot.content_totals), typeof body.conclusion === 'string' ? body.conclusion.slice(0, 2000) : null, typeof body.next_action === 'string' ? body.next_action.slice(0, 300) : null).first<Record<string, unknown>>()
        await context.env.DB.prepare("UPDATE website_batches SET status='已复盘',reviewed_at=?,review_conclusion=?,next_action=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(new Date().toISOString(), body.conclusion || null, body.next_action || null, id).run()
        return json({ snapshot: decorate(review) }, 200, '批次复盘已保存')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '批次复盘失败') }
}
