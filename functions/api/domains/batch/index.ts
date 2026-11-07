import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { isValidDate } from '../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
type Operation = { type: 'domain_patch'; id?: number; fields?: Record<string, unknown> }

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as { operations?: Operation[] }
        const operations = Array.isArray(body.operations) ? body.operations : []
        if (!operations.length) return json(null, 400, '没有可同步的操作')
        if (operations.length > 25) return json(null, 413, '单批最多同步 25 个操作')
        const statements: D1PreparedStatement[] = []
        for (const operation of operations) {
            if (operation.type === 'domain_patch') {
                const fields = operation.fields || {}
                const keys = Object.keys(fields)
                if (!Number.isInteger(operation.id) || !keys.length || keys.some(key => !['status', 'last_status_check_at'].includes(key))) return json(null, 400, '域名更新只支持状态与检查时间')
                if (fields.status !== undefined && !['在线', '离线'].includes(String(fields.status))) return json(null, 400, '域名状态无效')
                if (fields.last_status_check_at !== undefined && !isValidDate(fields.last_status_check_at)) return json(null, 400, '状态检查日期无效')
                if (!await context.env.DB.prepare('SELECT id FROM domains WHERE id=?').bind(operation.id).first()) return json(null, 404, '域名不存在')
                statements.push(context.env.DB.prepare(`UPDATE domains SET ${keys.map(key => `${key}=?`).join(', ')} WHERE id=?`).bind(...keys.map(key => fields[key]), operation.id))
            } else return json(null, 400, '包含不支持的批量操作')
        }
        await context.env.DB.batch(statements)
        return json({ accepted: operations.length })
    } catch (error) {
        return json(null, 503, error instanceof Error ? error.message : '批量同步失败，请稍后重试')
    }
}
