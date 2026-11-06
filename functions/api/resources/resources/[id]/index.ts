import type { Env, ProviderResource } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isIpAddress, isValidDate } from '../../../../utils/domain-validation'
import { isAccountOwnershipResource } from '../../../../domain/resource-bindings'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<ProviderResource>
        if (!data.name?.trim() || (data.status && !['正常', '停用', '未知'].includes(data.status))) return json(null, 400, '资源名称或状态无效')
        const existing = await context.env.DB.prepare('SELECT provider, identifier FROM provider_resources WHERE id = ?').bind(context.params.id).first<{ provider: string; identifier: string | null }>()
        if (!existing) return json(null, 404, '资源不存在')
        if (isAccountOwnershipResource(existing.identifier)) return json(null, 400, '账号归属资源由系统维护，具体资源请另行创建')
        if (existing.provider === 'vps' && (typeof data.ip_address !== 'string' || !isIpAddress(data.ip_address.trim()))) return json(null, 400, 'VPS 资源必须填写有效 IP 地址')
        if (data.port != null && (!Number.isInteger(data.port) || data.port < 1 || data.port > 65535)) return json(null, 400, '端口范围无效')
        if (data.expires_at && !isValidDate(data.expires_at)) return json(null, 400, '到期日期格式无效')
        if (data.account_id != null && !Number.isInteger(data.account_id)) return json(null, 400, '账号编号无效')
        if (data.account_id != null) {
            const account = await context.env.DB.prepare('SELECT provider FROM provider_accounts WHERE id = ?').bind(data.account_id).first<{ provider: string }>()
            if (!account || account.provider !== existing.provider) return json(null, 400, '账号不存在或服务商类型不匹配')
        } else if (existing.provider !== 'vps') return json(null, 400, '此类资源必须关联服务商账号')
        const result = await context.env.DB.prepare(`
            UPDATE provider_resources SET account_id = ?, name = ?, resource_url = ?, identifier = ?, ip_address = ?, port = ?, region = ?, status = ?, expires_at = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? RETURNING *
        `).bind(data.account_id || null, data.name.trim(), data.resource_url || null, data.identifier || null, data.ip_address || null, data.port || null, data.region || null, data.status || '正常', data.expires_at || null, data.memo || '', context.params.id).run<ProviderResource>()
        if (!result.results?.length) return json(null, 404, '资源不存在')
        return json(result.results[0], 200, '资源已更新')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '资源更新失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare("UPDATE provider_resources SET status = '停用', updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *").bind(context.params.id).run<ProviderResource>()
        if (!result.results?.length) return json(null, 404, '资源不存在')
        return json(result.results[0], 200, '资源已停用')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '资源停用失败') }
}
