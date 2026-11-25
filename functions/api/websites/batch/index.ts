import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { prepareWebsiteEdit, WebsiteEditError } from '../../../domain/website-edits'
import { ResourceBindingError, prepareWebsiteResourceAssignments } from '../../../domain/resource-bindings'
import { idGroups } from '../../../domain/bulk-ids'
import { resourceRoles } from '../../../../shared/resource-roles'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const positiveIds = (value: unknown, limit: number): value is number[] => Array.isArray(value) && value.length <= limit && value.every(id => Number.isSafeInteger(id) && id > 0) && new Set(value).size === value.length

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['website_ids', 'fields', 'account_ids', 'remove_account_ids', 'gsc_account_id', 'resource_assignments', 'batch_ids'].includes(key))) return json(null, 400, '批量设置格式无效')
        if (!positiveIds(body.website_ids, 200) || !body.website_ids.length) return json(null, 400, '网站编号必须是 1 到 200 个不重复的正整数')
        const websiteIds = body.website_ids
        if (body.fields !== undefined && (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields))) return json(null, 400, '批量更新字段格式无效')
        const fields = await prepareWebsiteEdit(context.env.DB, body.fields || {}, 'batch')
        const entries = Object.entries(fields)
        if (body.account_ids !== undefined && !positiveIds(body.account_ids, 20)) return json(null, 400, '请选择最多 20 个不重复的服务账号')
        const accountIds = (body.account_ids || []) as number[]
        if (body.remove_account_ids !== undefined && !positiveIds(body.remove_account_ids, 20)) return json(null, 400, '解除账号编号无效')
        const removeAccountIds = (body.remove_account_ids || []) as number[]
        if (accountIds.some(id => removeAccountIds.includes(id))) return json(null, 400, '同一账号不能同时关联和解除')
        if (body.batch_ids !== undefined && !positiveIds(body.batch_ids, 20)) return json(null, 400, '批次编号无效')
        const batchIds = (body.batch_ids || []) as number[]
        if (body.resource_assignments !== undefined && (!Array.isArray(body.resource_assignments) || body.resource_assignments.length > resourceRoles.length)) return json(null, 400, '资源关联格式无效')
        const resourceAssignments = (body.resource_assignments || []) as Array<{role:string;resource_id:number|null}>
        const roles = new Set<string>()
        for (const assignment of resourceAssignments) {
            if (!assignment || typeof assignment !== 'object' || Object.keys(assignment).some(key => !['role','resource_id'].includes(key)) || !(resourceRoles as readonly string[]).includes(assignment.role) || roles.has(assignment.role) || assignment.resource_id !== null && (!Number.isSafeInteger(assignment.resource_id) || Number(assignment.resource_id) <= 0)) return json(null, 400, '每种用途只能选择一项有效资源')
            roles.add(assignment.role)
        }
        const hasGsc = Object.prototype.hasOwnProperty.call(body, 'gsc_account_id')
        if (hasGsc && body.gsc_account_id !== null && (!Number.isSafeInteger(body.gsc_account_id) || Number(body.gsc_account_id) <= 0)) return json(null, 400, 'GSC 账号编号无效')
        if (!entries.length && !accountIds.length && !removeAccountIds.length && !hasGsc && !resourceAssignments.length && !batchIds.length) return json(null, 400, '请选择至少一项批量设置')

        const db = context.env.DB
        const existingIds = new Set<number>()
        const groups = idGroups(websiteIds)
        for (const ids of groups) {
            const existing = await db.prepare(`SELECT id FROM websites WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{id:number}>()
            for (const row of existing.results || []) existingIds.add(row.id)
        }
        const missing = websiteIds.find(id => !existingIds.has(id))
        if (missing) return json(null, 404, `网站 ${missing} 不存在`)
        if (accountIds.length) {
            const accounts = await db.prepare(`SELECT id FROM provider_accounts WHERE status<>'停用' AND id IN (${accountIds.map(() => '?').join(',')})`).bind(...accountIds).all<{id:number}>()
            if ((accounts.results || []).length !== accountIds.length) return json(null, 400, '部分服务账号不存在或已停用')
        }
        if (hasGsc && body.gsc_account_id !== null && !await db.prepare('SELECT id FROM gsc_accounts WHERE id=?').bind(body.gsc_account_id).first()) return json(null, 400, 'GSC 账号不存在')
        if (fields.adsense_account_id != null && !await db.prepare("SELECT id FROM adsense_accounts WHERE id=? AND status<>'停用'").bind(fields.adsense_account_id).first()) return json(null, 400, 'AdSense 账号不存在或已停用')
        for (const batchId of batchIds) if (!await db.prepare("SELECT id FROM website_batches WHERE id=? AND status<>'已归档'").bind(batchId).first()) return json(null, 400, '批次不存在或已归档')
        const writes = await prepareWebsiteResourceAssignments(db, websiteIds, resourceAssignments)
        for (const ids of groups) {
            const placeholders = ids.map(() => '?').join(',')
            if (entries.length) writes.push(db.prepare(`UPDATE websites SET ${entries.map(([key]) => `${key}=?`).join(',')} WHERE id IN (${placeholders})`).bind(...entries.map(([,value]) => value), ...ids))
            if (accountIds.length) writes.push(db.prepare(`INSERT INTO website_accounts(website_id,account_id) SELECT w.id,a.id FROM websites w CROSS JOIN provider_accounts a WHERE w.id IN (${placeholders}) AND a.id IN (${accountIds.map(() => '?').join(',')}) ON CONFLICT(website_id,account_id) DO NOTHING`).bind(...ids, ...accountIds))
            if (removeAccountIds.length) writes.push(db.prepare(`DELETE FROM website_accounts WHERE website_id IN (${placeholders}) AND account_id IN (${removeAccountIds.map(() => '?').join(',')})`).bind(...ids,...removeAccountIds))
            for (const batchId of batchIds) writes.push(db.prepare(`INSERT INTO website_batch_members(batch_id,website_id,membership_status) SELECT ?,id,'active' FROM websites WHERE id IN (${placeholders}) ON CONFLICT(batch_id,website_id) WHERE membership_status='active' DO NOTHING`).bind(batchId,...ids))
            if (hasGsc) writes.push(body.gsc_account_id === null
                ? db.prepare(`DELETE FROM website_gsc_accounts WHERE website_id IN (${placeholders})`).bind(...ids)
                : db.prepare(`INSERT INTO website_gsc_accounts(website_id,account_id) SELECT id,? FROM websites WHERE id IN (${placeholders}) ON CONFLICT(website_id) DO UPDATE SET account_id=excluded.account_id`).bind(body.gsc_account_id,...ids))
        }
        await db.batch(writes)
        return json({ accepted: websiteIds.length, website_ids: websiteIds }, 200, '网站批量设置成功')
    } catch (error) { return json(null, error instanceof WebsiteEditError ? error.status : error instanceof ResourceBindingError ? 400 : 500, error instanceof Error ? error.message : '网站批量设置失败') }
}
