import type { Env, ProviderAccount, ProviderType } from '../../../types'
import { legacyGithubToken } from '../../../../shared/github-token'
import { encryptCredential } from '../../../utils/credentials'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status, headers: { 'Cache-Control':'no-store' } })
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
        return json((result.results || []).map(account => account.provider === 'github' && legacyGithubToken(account.memo) ? { ...account, memo: '', legacy_token_pending: true } : account))
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取资源账号失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<ProviderAccount> & { token?: string }
        if (!providers.includes(data.provider as ProviderType) || !data.name?.trim() || data.name.length > 120 || (data.status && !['正常', '停用', '未知'].includes(data.status)) || (data.login_email && data.login_email.length > 254)) return json(null, 400, '服务商、账号名称、邮箱或状态无效')
        if (data.provider_name != null && (typeof data.provider_name !== 'string' || data.provider_name.length > 120) || data.github_username != null && data.github_username !== '' && (typeof data.github_username !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(data.github_username))) return json(null, 400, '服务商名称或 GitHub 用户名无效')
        if (data.token != null && (typeof data.token !== 'string' || data.token.length > 8192 || data.token.trim() && data.provider !== 'github')) return json(null,400,'Token 仅支持 GitHub 账号，且不能超过 8192 个字符')
        const legacy = data.provider === 'github' ? legacyGithubToken(data.memo) : null
        const token = data.token?.trim() || legacy
        let ciphertext: string | null = null
        try { if (token) ciphertext = await encryptCredential(token,context.env.CREDENTIAL_ENCRYPTION_KEY) } catch { return json(null,400,'请先配置有效的凭据加密密钥，账号未保存') }
        const statement = context.env.DB.prepare(`
            INSERT INTO provider_accounts (provider, name, login_email, status, memo, provider_name, github_username)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
        `).bind(data.provider, data.name.trim(), data.login_email || null, data.status || '正常', legacy ? '' : data.memo || '', data.provider_name || ({github:'GitHub',cloudflare:'Cloudflare'} as Record<string,string>)[data.provider!] || null, data.github_username || null)
        const writes = [statement]
        if (token && ciphertext) writes.push(context.env.DB.prepare("INSERT INTO provider_credentials(account_id,label,ciphertext,token_last4,is_default,status) VALUES(last_insert_rowid(),'默认 Token',?,?,1,'有效')").bind(ciphertext,token.slice(-4)))
        const result = await context.env.DB.batch(writes)
        return json(result[0].results?.[0] || null, 201, '账号创建成功')
    } catch (error) { return json(null, 409, '账号创建失败，请检查账号名称是否重复') }
}
