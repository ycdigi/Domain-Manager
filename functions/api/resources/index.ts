import type { Env, ProviderResource, ProviderType } from '../../types'
import { checkAuth } from '../../utils/auth'
import { isIpAddress, isValidDate } from '../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const providers: ProviderType[] = ['github', 'cloudflare', 'vhost', 'vps']

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const url = new URL(context.request.url)
        const provider = url.searchParams.get('provider')
        const sql = `
            SELECT r.*, a.name AS account_name, a.login_email AS login_email, COUNT(DISTINCT dr.domain_id) AS linked_domain_count
            FROM provider_resources r
            LEFT JOIN provider_accounts a ON a.id = r.account_id
            LEFT JOIN domain_resources dr ON dr.resource_id = r.id
            ${provider && providers.includes(provider as ProviderType) ? 'WHERE r.provider = ?' : ''}
            GROUP BY r.id ORDER BY r.provider, r.name COLLATE NOCASE
        `
        const result = provider && providers.includes(provider as ProviderType)
            ? await context.env.DB.prepare(sql).bind(provider).all<ProviderResource>()
            : await context.env.DB.prepare(sql).all<ProviderResource>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取资源失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<ProviderResource>
        if (!providers.includes(data.provider as ProviderType) || !data.name?.trim() || (data.status && !['正常', '停用', '未知'].includes(data.status))) return json(null, 400, '服务商、资源名称或状态无效')
        if (data.provider === 'vps' && (typeof data.ip_address !== 'string' || !isIpAddress(data.ip_address.trim()))) return json(null, 400, 'VPS 资源必须填写有效 IP 地址')
        if (data.port != null && (!Number.isInteger(data.port) || data.port < 1 || data.port > 65535)) return json(null, 400, '端口范围无效')
        if (data.expires_at && !isValidDate(data.expires_at)) return json(null, 400, '到期日期格式无效')
        if (data.account_id != null && !Number.isInteger(data.account_id)) return json(null, 400, '账号编号无效')
        if (data.account_id != null) {
            const account = await context.env.DB.prepare('SELECT provider FROM provider_accounts WHERE id = ?').bind(data.account_id).first<{ provider: string }>()
            if (!account || account.provider !== data.provider) return json(null, 400, '账号不存在或服务商类型不匹配')
        } else if (data.provider !== 'vps') return json(null, 400, '此类资源必须关联服务商账号')
        const result = await context.env.DB.prepare(`
            INSERT INTO provider_resources (account_id, provider, name, resource_url, identifier, ip_address, port, region, status, expires_at, memo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
        `).bind(data.account_id || null, data.provider, data.name.trim(), data.resource_url || null, data.identifier || null, data.ip_address || null, data.port || null, data.region || null, data.status || '正常', data.expires_at || null, data.memo || '').run<ProviderResource>()
        return json(result.results?.[0] || null, 201, '资源创建成功')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '资源创建失败') }
}
