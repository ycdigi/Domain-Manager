import type { Env, ProviderAccount, ProviderType } from '../../../types'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const providers: ProviderType[] = ['github', 'cloudflare', 'vhost', 'vps']

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare(`
            SELECT a.*,
                   COUNT(DISTINCT CASE WHEN r.identifier IS NULL OR r.identifier NOT LIKE 'account:%' THEN r.id END) AS resource_count,
                   COUNT(DISTINCT dr.website_id) AS linked_website_count,
                   COUNT(DISTINCT CASE WHEN r.status = '正常' AND (r.identifier IS NULL OR r.identifier NOT LIKE 'account:%') THEN r.id END) AS active_resource_count
            FROM provider_accounts a
            LEFT JOIN provider_resources r ON r.account_id = a.id
            LEFT JOIN website_resources dr ON dr.resource_id = r.id
            GROUP BY a.id
            ORDER BY a.provider, a.name COLLATE NOCASE
        `).all<ProviderAccount>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取资源账号失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<ProviderAccount>
        if (!providers.includes(data.provider as ProviderType) || !data.name?.trim() || data.name.length > 120 || (data.status && !['正常', '停用', '未知'].includes(data.status)) || (data.login_email && data.login_email.length > 254)) return json(null, 400, '服务商、账号名称、邮箱或状态无效')
        const result = await context.env.DB.prepare(`
            INSERT INTO provider_accounts (provider, name, login_email, status, memo)
            VALUES (?, ?, ?, ?, ?) RETURNING *
        `).bind(data.provider, data.name.trim(), data.login_email || null, data.status || '正常', data.memo || '').run<ProviderAccount>()
        return json(result.results?.[0] || null, 201, '账号创建成功')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '账号创建失败') }
}
