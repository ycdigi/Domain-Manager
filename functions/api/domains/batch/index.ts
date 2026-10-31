import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { isValidDate, todayShanghaiDate } from '../../../utils/domain-validation'

type DomainPatch = { type: 'domain_patch'; id: number; fields: Record<string, unknown> }
type LinkAdd = { type: 'resource_link_add'; domain_id: number; resource_id: number; role: string; is_primary?: number; memo?: string }
type LinkRemove = { type: 'resource_link_remove'; id: number }
type Operation = DomainPatch | LinkAdd | LinkRemove

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const validStatus = (value: unknown) => value === '在线' || value === '离线'

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context)
    if (authError) return authError
    try {
        const body = await context.request.json() as { operations?: Operation[] }
        const operations = Array.isArray(body.operations) ? body.operations : []
        if (!operations.length) return json(null, 400, '没有可同步的操作')
        if (operations.length > 25) return json(null, 413, '单批最多同步 25 个操作')

        const statements: D1PreparedStatement[] = []
        for (const operation of operations) {
            if (operation.type === 'domain_patch') {
                if (!Number.isInteger(operation.id) || !operation.fields || typeof operation.fields !== 'object') return json(null, 400, '域名更新格式无效')
                const fields = operation.fields
                const keys = Object.keys(fields)
                if (!keys.length || keys.some(key => !['status', 'last_status_check_at', 'daily_clicks', 'clicks_updated_date', 'seo_last_date'].includes(key))) return json(null, 400, '域名更新包含不支持的字段')
                if ('status' in fields && !validStatus(fields.status)) return json(null, 400, '网站状态无效')
                if ('last_status_check_at' in fields && !isValidDate(fields.last_status_check_at)) return json(null, 400, '检查日期无效')
                if ('daily_clicks' in fields && fields.daily_clicks !== null && (!Number.isInteger(fields.daily_clicks) || Number(fields.daily_clicks) < 0)) return json(null, 400, '日点击必须是非负整数或空值')
                if ('seo_last_date' in fields && fields.seo_last_date !== null && !isValidDate(fields.seo_last_date)) return json(null, 400, 'SEO 日期格式无效')

                const assignments: string[] = []
                const values: unknown[] = []
                const changed: string[] = []
                const changedValues: unknown[] = []
                if ('status' in fields) {
                    const checkedDate = (fields.last_status_check_at as string | undefined) || todayShanghaiDate()
                    assignments.push('status = ?', 'last_status_check_at = ?')
                    values.push(fields.status, checkedDate)
                    changed.push('(status IS NOT ? OR date(last_status_check_at) IS NOT ?)')
                    changedValues.push(fields.status, checkedDate)
                }
                if ('last_status_check_at' in fields && !('status' in fields)) {
                    assignments.push('last_status_check_at = ?')
                    values.push(fields.last_status_check_at)
                    changed.push('date(last_status_check_at) IS NOT ?')
                    changedValues.push(fields.last_status_check_at)
                }
                if ('daily_clicks' in fields) {
                    if (fields.daily_clicks !== null && !isValidDate(fields.clicks_updated_date)) return json(null, 400, '点击数据日期无效')
                    assignments.push('daily_clicks = ?', 'clicks_updated_date = ?')
                    values.push(fields.daily_clicks, fields.daily_clicks === null ? null : fields.clicks_updated_date)
                    changed.push('(daily_clicks IS NOT ? OR clicks_updated_date IS NOT ?)')
                    changedValues.push(fields.daily_clicks, fields.daily_clicks === null ? null : fields.clicks_updated_date)
                }
                if ('seo_last_date' in fields) {
                    assignments.push('seo_last_date = ?')
                    values.push(fields.seo_last_date)
                    changed.push('seo_last_date IS NOT ?')
                    changedValues.push(fields.seo_last_date)
                }
                statements.push(context.env.DB.prepare(`UPDATE domains SET ${assignments.join(', ')} WHERE id = ? AND (${changed.join(' OR ')})`).bind(...values, operation.id, ...changedValues))
            } else if (operation.type === 'resource_link_add') {
                if (!Number.isInteger(operation.domain_id) || !Number.isInteger(operation.resource_id) || typeof operation.role !== 'string' || !operation.role.trim()) return json(null, 400, '资源关联格式无效')
                const valid = await context.env.DB.prepare(`SELECT
                    EXISTS(SELECT 1 FROM domains WHERE id = ?) AS domain_exists,
                    EXISTS(SELECT 1 FROM provider_resources WHERE id = ?) AS resource_exists
                `).bind(operation.domain_id, operation.resource_id).first<{ domain_exists: number; resource_exists: number }>()
                if (!valid?.domain_exists || !valid.resource_exists) return json(null, 400, '网站或资源不存在')
                statements.push(context.env.DB.prepare(`
                    INSERT INTO domain_resources (domain_id, resource_id, role, is_primary, memo)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(domain_id, resource_id, role) DO UPDATE SET is_primary = excluded.is_primary, memo = excluded.memo
                `).bind(operation.domain_id, operation.resource_id, operation.role.trim(), operation.is_primary ? 1 : 0, operation.memo || ''))
            } else if (operation.type === 'resource_link_remove') {
                if (!Number.isInteger(operation.id)) return json(null, 400, '资源关联编号无效')
                statements.push(context.env.DB.prepare('DELETE FROM domain_resources WHERE id = ?').bind(operation.id))
            } else return json(null, 400, '包含不支持的批量操作')
        }

        await context.env.DB.batch(statements)
        return json({ accepted: operations.length })
    } catch (error) {
        console.error('批量同步失败:', error)
        return json(null, 503, '批量同步失败，请稍后重试')
    }
}
