import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { validateBatchFields } from '../../domain/batches'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const rows = await context.env.DB.prepare(`SELECT b.*, COUNT(CASE WHEN m.membership_status='active' THEN 1 END) AS member_count,
            (SELECT COUNT(*) FROM website_batch_reviews r WHERE r.batch_id=b.id) AS review_count
            FROM website_batches b LEFT JOIN website_batch_members m ON m.batch_id=b.id
            GROUP BY b.id ORDER BY CASE b.status WHEN '待复盘' THEN 0 WHEN '进行中' THEN 1 WHEN '已复盘' THEN 2 ELSE 3 END,b.updated_at DESC,b.id DESC`).all()
        return json(rows.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取批次失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        const validation = validateBatchFields(body, {}, {create:true})
        if (validation) return json(null, 400, validation)
        const name = String(body.name).trim()
        const row = await context.env.DB.prepare(`INSERT INTO website_batches (name,source,goal,hypothesis) VALUES (?,?,?,?) RETURNING *`)
            .bind(name, body.source || null, body.goal || null, body.hypothesis || null).first()
        return json(row, 201, '批次已创建')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '批次创建失败') }
}
