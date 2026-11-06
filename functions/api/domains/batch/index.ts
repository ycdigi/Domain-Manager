import type { Env, Domain } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { isValidDate } from '../../../utils/domain-validation'

import { prepareWebsiteChange, websiteWrite, WebsiteChangeError } from '../../../domain/website-changes'
import { bindingWrite, primaryClearWrite, ResourceBindingError, resolveBindingResource } from '../../../domain/resource-bindings'

type DomainPatch = { type: 'domain_patch'; id: number; fields: Record<string, unknown> }
type LinkAdd = { type: 'resource_link_add'; domain_id: number; resource_id: number; role: string; is_primary?: number; memo?: string }
type LinkRemove = { type: 'resource_link_remove'; id: number }
type DomainOperationAdd = { type: 'domain_operation_add'; domain_id: number; operation_date: string; operation_kind: 'SEO' | '内容' | '技术' | '其他' }
type Operation = DomainPatch | DomainOperationAdd | LinkAdd | LinkRemove

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context)
    if (authError) return authError
    try {
        const body = await context.request.json() as { operations?: Operation[] }
        const operations = Array.isArray(body.operations) ? body.operations : []
        if (!operations.length) return json(null, 400, '没有可同步的操作')
        if (operations.length > 25) return json(null, 413, '单批最多同步 25 个操作')

        const statements: D1PreparedStatement[] = []
        const projected = new Map<number, Domain>()
        for (const operation of operations) {
            if (operation.type === 'domain_patch') {
                if (!Number.isInteger(operation.id) || !operation.fields || typeof operation.fields !== 'object') return json(null, 400, '域名更新格式无效')
                const fields = operation.fields
                const keys = Object.keys(fields)
                if (!keys.length || keys.some(key => !['status', 'last_status_check_at', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'seo_last_date'].includes(key))) return json(null, 400, '域名更新包含不支持的字段')
                const current = projected.get(operation.id) || await context.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(operation.id).first<Domain>()
                if (!current) return json(null, 400, '域名不存在')
                const change = prepareWebsiteChange(current, fields, 'patch')
                projected.set(operation.id, change.record)
                statements.push(websiteWrite(context.env.DB, change, operation.id))
            } else if (operation.type === 'domain_operation_add') {
                if (!Number.isInteger(operation.domain_id) || !isValidDate(operation.operation_date) || !['SEO', '内容', '技术', '其他'].includes(operation.operation_kind)) return json(null, 400, '操作日期格式无效')
                statements.push(context.env.DB.prepare(`
                    INSERT OR IGNORE INTO domain_operations (domain_id, operation_date, operation_kind)
                    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM domains WHERE id = ?)
                `).bind(operation.domain_id, operation.operation_date, operation.operation_kind, operation.domain_id))
            } else if (operation.type === 'resource_link_add') {
                if (!Number.isInteger(operation.domain_id) || !Number.isInteger(operation.resource_id) || typeof operation.role !== 'string' || !operation.role.trim()) return json(null, 400, '资源关联格式无效')
                const resource = await resolveBindingResource(context.env.DB, { domainId: operation.domain_id, resourceId: operation.resource_id, role: operation.role, isPrimary: operation.is_primary, memo: operation.memo })
                if (operation.is_primary) statements.push(primaryClearWrite(context.env.DB, operation.domain_id))
                statements.push(bindingWrite(context.env.DB, { domainId: operation.domain_id, role: operation.role, isPrimary: operation.is_primary, memo: operation.memo }, resource.id, false))
            } else if (operation.type === 'resource_link_remove') {
                if (!Number.isInteger(operation.id)) return json(null, 400, '资源关联编号无效')
                statements.push(context.env.DB.prepare('DELETE FROM domain_resources WHERE id = ?').bind(operation.id))
            } else return json(null, 400, '包含不支持的批量操作')
        }

        await context.env.DB.batch(statements)
        return json({ accepted: operations.length })
    } catch (error) {
        if (error instanceof WebsiteChangeError || error instanceof ResourceBindingError) return json(null, 400, error.message)
        console.error('批量同步失败:', error)
        return json(null, 503, '批量同步失败，请稍后重试')
    }
}
