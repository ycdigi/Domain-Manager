import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { validateWebsiteFields } from '../../../domain/website-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const allowedFields = new Set(['stage', 'lifecycle', 'computer_name', 'ownership', 'platform', 'industry'])
const positiveIds = (value: unknown, limit: number): value is number[] => Array.isArray(value) && value.length <= limit && value.every(id => Number.isSafeInteger(id) && id > 0) && new Set(value).size === value.length

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['website_ids', 'fields', 'account_ids', 'gsc_account_id'].includes(key))) return json(null, 400, '批量设置格式无效')
        if (!positiveIds(body.website_ids, 200) || !body.website_ids.length) return json(null, 400, '网站编号必须是 1 到 200 个不重复的正整数')
        const websiteIds = body.website_ids
        if (body.fields !== undefined && (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields))) return json(null, 400, '批量更新字段格式无效')
        const fields = (body.fields || {}) as Record<string, unknown>
        const entries = Object.entries(fields)
        if (entries.some(([key]) => !allowedFields.has(key))) return json(null, 400, '包含不支持的批量设置字段')
        const validation = validateWebsiteFields(fields)
        if (validation) return json(null, 400, validation)
        if (body.account_ids !== undefined && !positiveIds(body.account_ids, 20)) return json(null, 400, '请选择最多 20 个不重复的服务账号')
        const accountIds = (body.account_ids || []) as number[]
        const hasGsc = Object.prototype.hasOwnProperty.call(body, 'gsc_account_id')
        if (hasGsc && body.gsc_account_id !== null && (!Number.isSafeInteger(body.gsc_account_id) || Number(body.gsc_account_id) <= 0)) return json(null, 400, 'GSC 账号编号无效')
        if (!entries.length && !accountIds.length && !hasGsc) return json(null, 400, '请选择至少一项批量设置')

        const db = context.env.DB
        const existingIds = new Set<number>()
        for (let offset=0; offset<websiteIds.length; offset+=80) {
            const ids = websiteIds.slice(offset,offset+80)
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

        if (Object.prototype.hasOwnProperty.call(fields, 'platform')) entries.push(['platform_other', null])

        const writes: D1PreparedStatement[] = []
        for (const id of websiteIds) {
            if (entries.length) writes.push(db.prepare(`UPDATE websites SET ${entries.map(([key]) => `${key}=?`).join(',')} WHERE id=?`).bind(...entries.map(([,value]) => value), id))
            if (accountIds.length) writes.push(db.prepare(`INSERT INTO website_accounts(website_id,account_id) SELECT ?,id FROM provider_accounts WHERE id IN (${accountIds.map(() => '?').join(',')}) ON CONFLICT(website_id,account_id) DO NOTHING`).bind(id, ...accountIds))
            if (hasGsc) writes.push(body.gsc_account_id === null
                ? db.prepare('DELETE FROM website_gsc_accounts WHERE website_id=?').bind(id)
                : db.prepare('INSERT INTO website_gsc_accounts(website_id,account_id) VALUES(?,?) ON CONFLICT(website_id) DO UPDATE SET account_id=excluded.account_id').bind(id, body.gsc_account_id))
        }
        await db.batch(writes)
        return json({ accepted: websiteIds.length, website_ids: websiteIds }, 200, '网站批量设置成功')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '网站批量设置失败') }
}
