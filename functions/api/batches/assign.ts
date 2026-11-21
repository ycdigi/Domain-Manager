import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { getBatchDetail, validateBatchFields } from '../../domain/batches'
import { validateWebsiteFields } from '../../domain/website-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const idsOf = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 200 && value.every(id => Number.isSafeInteger(id) && Number(id) > 0) && new Set(value as number[]).size === value.length ? value as number[] : null
const text = (value: unknown, max: number) => value == null || typeof value === 'string' && value.length <= max

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    let createdBatchId: number | null = null
    try {
        const body = await context.request.json() as Record<string, unknown>
        const websiteIds = idsOf(body.website_ids)
        if (!websiteIds) return json(null, 400, '网站编号必须是 1 到 200 个不重复的正整数')

        const batchId = body.batch_id == null ? null : Number(body.batch_id)
        const newBatch = body.batch
        const hasExistingBatch = batchId != null
        const hasNewBatch = newBatch != null
        if (hasExistingBatch === hasNewBatch) return json(null, 400, '必须选择已有批次或提供新批次名称')
        if (hasExistingBatch && (!Number.isSafeInteger(batchId) || Number(batchId) <= 0)) return json(null, 400, '批次编号无效')
        if (!text(body.member_note, 500)) return json(null, 400, '成员备注不能超过 500 个字符')

        const websiteFields = body.website_fields == null ? {} : body.website_fields
        if (typeof websiteFields !== 'object' || Array.isArray(websiteFields)) return json(null, 400, '批量网站字段格式无效')
        const fieldEntries = Object.entries(websiteFields as Record<string, unknown>)
        if (fieldEntries.some(([key]) => key !== 'stage')) return json(null, 400, '批量网站字段只支持阶段')
        const websiteFieldError = validateWebsiteFields(websiteFields as Record<string, unknown>)
        if (websiteFieldError) return json(null, 400, websiteFieldError)

        const db = context.env.DB
        const siteRows = await db.prepare(`SELECT id FROM websites WHERE id IN (${websiteIds.map(() => '?').join(',')})`).bind(...websiteIds).all<{ id: number }>()
        if ((siteRows.results || []).length !== websiteIds.length) return json(null, 404, '部分网站不存在')

        if (hasExistingBatch) {
            const batch = await db.prepare('SELECT id,status FROM website_batches WHERE id=?').bind(batchId).first<{ id: number; status: string }>()
            if (!batch) return json(null, 404, '批次不存在')
            if (batch.status === '已归档') return json(null, 409, '已归档批次不可继续加入网站')
        } else {
            if (typeof newBatch !== 'object' || Array.isArray(newBatch)) return json(null, 400, '新批次信息格式无效')
            const batchFields = newBatch as Record<string, unknown>
            const batchError = validateBatchFields({ name: batchFields.name, source: batchFields.source, goal: batchFields.goal, hypothesis: batchFields.hypothesis })
            if (batchError) return json(null, 400, batchError)
        }

        const targetBatchId = hasExistingBatch ? batchId! : null
        const activeResult = targetBatchId == null ? null : await db.prepare(`SELECT website_id,membership_status FROM website_batch_members WHERE batch_id=? AND website_id IN (${websiteIds.map(() => '?').join(',')})`).bind(targetBatchId, ...websiteIds).all<{ website_id: number; membership_status: 'active' | 'removed' }>()
        const activeRows: Array<{ website_id: number; membership_status: 'active' | 'removed' }> = activeResult == null ? [] : 'results' in activeResult ? activeResult.results || [] : activeResult
        const activeIds = new Set(activeRows.filter(row => row.membership_status === 'active').map(row => Number(row.website_id)))
        const reactivatedIds = new Set(activeRows.filter(row => row.membership_status === 'removed').map(row => Number(row.website_id)))
        const memberIds = websiteIds.filter(id => !activeIds.has(id))
        const note = typeof body.member_note === 'string' && body.member_note.trim() ? body.member_note.trim().slice(0, 500) : null

        if (!hasExistingBatch) {
            const batchFields = newBatch as Record<string, unknown>
            const created = await db.prepare('INSERT INTO website_batches (name,source,goal,hypothesis) VALUES (?,?,?,?) RETURNING id')
                .bind(String(batchFields.name).trim(), batchFields.source || null, batchFields.goal || null, batchFields.hypothesis || null).first<{ id: number }>()
            if (!created) throw new Error('新批次创建失败')
            createdBatchId = Number(created.id)
        }

        const finalBatchId = targetBatchId ?? createdBatchId!
        const statements: D1PreparedStatement[] = []
        for (const websiteId of memberIds) {
            statements.push(db.prepare(`INSERT INTO website_batch_members (batch_id,website_id,member_note,membership_status) VALUES (?,?,?,'active')`).bind(finalBatchId, websiteId, note))
        }
        if (fieldEntries.length) {
            const assignments = fieldEntries.map(([key]) => `${key}=?`).join(', ')
            const values = fieldEntries.map(([, value]) => value === '' ? null : value)
            for (const websiteId of websiteIds) statements.push(db.prepare(`UPDATE websites SET ${assignments} WHERE id=?`).bind(...values, websiteId))
        }
        if (hasExistingBatch && statements.length) statements.push(db.prepare("UPDATE website_batches SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='已复盘'").bind(finalBatchId))
        if (statements.length) await db.batch(statements)

        const detail = await getBatchDetail(db, finalBatchId)
        return json({ batch: detail, batch_id: finalBatchId, website_ids: websiteIds, accepted: memberIds.length, skipped: activeIds.size, reactivated: reactivatedIds.size }, hasNewBatch ? 201 : 200, hasNewBatch ? '批次已创建并加入网站' : '网站已加入批次')
    } catch (error) {
        if (createdBatchId != null) {
            try { await context.env.DB.prepare('DELETE FROM website_batches WHERE id=?').bind(createdBatchId).run() } catch { /* preserve original failure */ }
        }
        return json(null, 500, error instanceof Error ? error.message : '批量加入批次失败')
    }
}
