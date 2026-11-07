import type { Env } from '../../types'
import { checkApiToken } from '../../utils/auth'
import { normalizeDomain, todayShanghaiDate } from '../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
type StatusCheck = { id?: unknown; domain?: unknown; status?: unknown }

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkApiToken(context); if (authError) return authError
    try {
        const rows = await context.env.DB.prepare(`
            SELECT id, website_id, domain, status, last_status_check_at
            FROM domains
            WHERE website_id IS NOT NULL AND is_primary = 1
            ORDER BY id
        `).all()
        return json(rows.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取检查目标失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkApiToken(context); if (authError) return authError
    try {
        const body = await context.request.json() as { checks?: StatusCheck[] }
        const checks = Array.isArray(body.checks) ? body.checks : []
        if (!checks.length) return json(null, 400, '没有可写入的检查结果')
        if (checks.length > 200) return json(null, 413, '单批最多写入 200 个检查结果')
        const checkedDate = todayShanghaiDate()
        const statements: D1PreparedStatement[] = []
        for (const check of checks) {
            const id = Number(check.id)
            if (!Number.isInteger(id) || id < 1 || !['在线', '离线'].includes(String(check.status))) return json(null, 400, '检查结果格式无效')
            if (check.domain !== undefined && (typeof check.domain !== 'string' || normalizeDomain(check.domain) === '')) return json(null, 400, '检查域名格式无效')
            const domain = await context.env.DB.prepare('SELECT id FROM domains WHERE id=? AND website_id IS NOT NULL AND is_primary=1').bind(id).first()
            if (!domain) return json(null, 404, `主域名 ${id} 不存在`)
            statements.push(context.env.DB.prepare('UPDATE domains SET status=?, last_status_check_at=? WHERE id=?').bind(check.status, checkedDate, id))
        }
        await context.env.DB.batch(statements)
        return json({ accepted: checks.length, checked_at: checkedDate })
    } catch (error) { return json(null, 503, error instanceof Error ? error.message : '写入检查结果失败') }
}
