import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { validateWebsiteFields } from '../../domain/website-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const allowed = new Set(['name', 'stage', 'lifecycle', 'ownership', 'industry', 'platform', 'platform_other', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'gsc_connected', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'potential', 'priority_order', 'next_action', 'next_action_due_date', 'next_action_status'])
export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        const entries = Object.entries(body)
        if (!entries.length || entries.some(([key]) => !allowed.has(key))) return json(null, 400, '网站更新包含不支持的字段')
        const id = Number(context.params.id)
        const current = await context.env.DB.prepare('SELECT * FROM websites WHERE id=?').bind(id).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '网站不存在')
        const validation = validateWebsiteFields(body, current)
        if (validation) return json(null, 400, validation)
        const accountId = body.adsense_account_id ?? current.adsense_account_id
        if (accountId != null && !await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(accountId).first()) return json(null, 400, 'AdSense 账号不存在')
        const assignments = entries.map(([key]) => `${key}=?`).join(', ')
        const result = await context.env.DB.prepare(`UPDATE websites SET ${assignments} WHERE id=? RETURNING *`).bind(...entries.map(([, value]) => value === '' ? null : value), id).first()
        return json(result, 200, '网站已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '网站更新失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare('DELETE FROM websites WHERE id=?').bind(context.params.id).run()
        return result.meta.changes ? json(null, 200, '网站及其资料已删除') : json(null, 404, '网站不存在')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '网站删除失败') }
}
