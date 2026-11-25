import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { prepareWebsiteEdit, websiteEditWrite, WebsiteEditError } from '../../../domain/website-edits'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as { website_ids?: unknown; fields?: unknown }
        const websiteIds = Array.isArray(body.website_ids) ? body.website_ids : []
        if (!websiteIds.length || websiteIds.length > 200 || websiteIds.some(id => !Number.isInteger(id) || Number(id) <= 0)) return json(null, 400, '网站编号必须是 1 到 200 个正整数')
        const uniqueIds = [...new Set(websiteIds as number[])]
        if (uniqueIds.length !== websiteIds.length) return json(null, 400, '网站编号不能重复')
        if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) return json(null, 400, '缺少批量更新字段')
        const fields = await prepareWebsiteEdit(context.env.DB, body.fields, 'batch')
        if (!Object.keys(fields).length) return json(null, 400, '缺少批量更新字段')

        const placeholders = uniqueIds.map(() => '?').join(', ')
        const existing = await context.env.DB.prepare(`SELECT id FROM websites WHERE id IN (${placeholders})`).bind(...uniqueIds).all<{ id: number }>()
        const existingIds = new Set((existing.results || []).map(row => Number(row.id)))
        const missing = uniqueIds.find(id => !existingIds.has(id))
        if (missing) return json(null, 404, `网站 ${missing} 不存在`)

        await context.env.DB.batch(uniqueIds.map(id => websiteEditWrite(context.env.DB, id, fields)))
        return json({ accepted: uniqueIds.length, website_ids: uniqueIds }, 200, '网站批量更新成功')
    } catch (error) { return json(null, error instanceof WebsiteEditError ? error.status : 500, error instanceof Error ? error.message : '网站批量更新失败') }
}
