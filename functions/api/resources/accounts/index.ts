import type { Env, ProviderAccount, ProviderType } from '../../../types'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const providers: ProviderType[] = ['github', 'cloudflare', 'vhost', 'vps']

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare(`
            SELECT a.*,
                   (SELECT c.token_last4 FROM provider_credentials c WHERE c.account_id=a.id AND c.is_default=1) AS default_token_last4,
                   (SELECT CASE WHEN c.expires_at IS NOT NULL AND c.expires_at<date('now') THEN '已到期' ELSE c.status END FROM provider_credentials c WHERE c.account_id=a.id AND c.is_default=1) AS default_token_status,
                   COUNT(DISTINCT r.id) AS resource_count,
                   (SELECT COUNT(*) FROM (SELECT wr.website_id FROM website_resources wr JOIN provider_resources pr ON pr.id=wr.resource_id WHERE pr.account_id=a.id UNION SELECT wa.website_id FROM website_accounts wa WHERE wa.account_id=a.id)) AS linked_website_count,
                   COUNT(DISTINCT CASE WHEN r.status = '正常' THEN r.id END) AS active_resource_count
            FROM provider_accounts a
            LEFT JOIN provider_resources r ON r.account_id = a.id
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
        if (data.provider_name != null && (typeof data.provider_name !== 'string' || data.provider_name.length > 120) || data.github_username != null && data.github_username !== '' && (typeof data.github_username !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(data.github_username))) return json(null, 400, '服务商名称或 GitHub 用户名无效')
        const result = await context.env.DB.prepare(`
            INSERT INTO provider_accounts (provider, name, login_email, status, memo, provider_name, github_username)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
        `).bind(data.provider, data.name.trim(), data.login_email || null, data.status || '正常', data.memo || '', data.provider_name || ({github:'GitHub',cloudflare:'Cloudflare'} as Record<string,string>)[data.provider!] || null, data.github_username || null).run<ProviderAccount>()
        return json(result.results?.[0] || null, 201, '账号创建成功')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '账号创建失败') }
}
