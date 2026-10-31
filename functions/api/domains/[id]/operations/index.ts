import type { Env, DomainOperation, DomainOperationKind } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isValidDate, todayShanghaiDate } from '../../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const kinds: DomainOperationKind[] = ['SEO', '内容', '技术', '其他']

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare(`
            SELECT id, domain_id, operation_date, operation_kind, created_at
            FROM domain_operations
            WHERE domain_id = ?
            ORDER BY operation_date DESC, id DESC
        `).bind(context.params.id).all<DomainOperation>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取操作记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<DomainOperation>
        const operationDate = data.operation_date || todayShanghaiDate()
        if (!isValidDate(operationDate) || !kinds.includes(data.operation_kind as DomainOperationKind)) return json(null, 400, '操作日期或类型无效')
        const domain = await context.env.DB.prepare('SELECT id FROM domains WHERE id = ?').bind(context.params.id).first()
        if (!domain) return json(null, 404, '域名不存在')
        const result = await context.env.DB.prepare(`
            INSERT INTO domain_operations (domain_id, operation_date, operation_kind)
            VALUES (?, ?, ?)
            ON CONFLICT(domain_id, operation_date, operation_kind) DO NOTHING
            RETURNING *
        `).bind(context.params.id, operationDate, data.operation_kind).run<DomainOperation>()
        if (result.results?.[0]) return json(result.results[0], 201, '操作日期已记录')
        const existing = await context.env.DB.prepare(`
            SELECT id, domain_id, operation_date, operation_kind, created_at
            FROM domain_operations WHERE domain_id = ? AND operation_date = ? AND operation_kind = ?
        `).bind(context.params.id, operationDate, data.operation_kind).first<DomainOperation>()
        return json(existing, 200, '当天该类型已记录')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '保存操作记录失败') }
}
