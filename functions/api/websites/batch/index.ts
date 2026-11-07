import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { validateWebsiteFields } from '../../../domain/website-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const allowedFields = new Set(['stage', 'lifecycle'])

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as { website_ids?: unknown; fields?: unknown }
        const websiteIds = Array.isArray(body.website_ids) ? body.website_ids : []
        if (!websiteIds.length || websiteIds.length > 200 || websiteIds.some(id => !Number.isInteger(id) || Number(id) <= 0)) return json(null, 400, '网站编号必须是 1 到 200 个正整数')
        const uniqueIds = [...new Set(websiteIds as number[])]
        if (uniqueIds.length !== websiteIds.length) return json(null, 400, '网站编号不能重复')
        if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) return json(null, 400, '缺少批量更新字段')
        const fields = body.fields as Record<string, unknown>
        const entries = Object.entries(fields)
        if (!entries.length || entries.some(([key]) => !allowedFields.has(key))) return json(null, 400, '批量更新只支持阶段与经营状态')
        const validation = validateWebsiteFields(fields)
        if (validation) return json(null, 400, validation)

        const placeholders = uniqueIds.map(() => '?').join(', ')
        const existing = await context.env.DB.prepare(`SELECT id FROM websites WHERE id IN (${placeholders})`).bind(...uniqueIds).all<{ id: number }>()
        const existingIds = new Set((existing.results || []).map(row => Number(row.id)))
        const missing = uniqueIds.find(id => !existingIds.has(id))
        if (missing) return json(null, 404, `网站 ${missing} 不存在`)

        const assignments = entries.map(([key]) => `${key}=?`).join(', ')
        const values = entries.map(([, value]) => value)
        await context.env.DB.batch(uniqueIds.map(id => context.env.DB.prepare(`UPDATE websites SET ${assignments} WHERE id=?`).bind(...values, id)))
        return json({ accepted: uniqueIds.length, website_ids: uniqueIds }, 200, '网站批量更新成功')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '网站批量更新失败') }
}
