import type { Env, ProviderAccount } from '../../../../types'
import { legacyGithubToken } from '../../../../../shared/github-token'
import { defaultTokenWrite, migrateGithubTokens } from '../../../../domain/github-credentials'
import { checkAuth } from '../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status, headers:{'Cache-Control':'no-store'} })

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<ProviderAccount> & { token?: string }
        if (!data.name?.trim() || data.name.length > 120 || (data.status && !['正常', '停用', '未知'].includes(data.status)) || (data.login_email && data.login_email.length > 254)) return json(null, 400, '账号名称、邮箱或状态无效')
        if (data.provider_name != null && (typeof data.provider_name !== 'string' || data.provider_name.length > 120) || data.github_username != null && data.github_username !== '' && (typeof data.github_username !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(data.github_username))) return json(null, 400, '服务商名称或 GitHub 用户名无效')
        const current = await context.env.DB.prepare('SELECT * FROM provider_accounts WHERE id=?').bind(context.params.id).first<ProviderAccount>()
        if (!current) return json(null,404,'账号不存在')
        if (data.token != null && (typeof data.token !== 'string' || data.token.length > 8192 || data.token.trim() && current.provider !== 'github')) return json(null,400,'Token 仅支持 GitHub 账号，且不能超过 8192 个字符')
        const incomingLegacy = current.provider === 'github' ? legacyGithubToken(data.memo) : null
        const legacy = current.provider === 'github' ? legacyGithubToken(current.memo) : null
        const token = data.token?.trim() || incomingLegacy
        if (legacy && !token) {
            try {
                const migrated = await migrateGithubTokens(context.env.DB,context.env.CREDENTIAL_ENCRYPTION_KEY,Number(context.params.id))
                if (migrated.conflicts.length) return json(null,409,'旧备注 Token 与默认 Token 不同，请在 Token 输入框填写要使用的值后保存')
            } catch { return json(null,400,'请先配置有效的凭据加密密钥，账号未保存') }
        }
        let tokenWrite: D1PreparedStatement | undefined
        try { if (token) tokenWrite = await defaultTokenWrite(context.env.DB,Number(context.params.id),token,context.env.CREDENTIAL_ENCRYPTION_KEY) } catch { return json(null,400,'请先配置有效的凭据加密密钥，账号未保存') }
        const memo = incomingLegacy ? '' : data.memo || ''
        const statement = context.env.DB.prepare(`
            UPDATE provider_accounts SET provider_name = ?, github_username = ?, name = ?, login_email = ?, status = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? RETURNING *
        `).bind(data.provider_name || null, data.github_username || null, data.name.trim(), data.login_email || null, data.status || '正常', memo, context.params.id)
        const results = await context.env.DB.batch([statement,...(tokenWrite ? [tokenWrite] : [])])
        const result = results[0]
        if (!result.results?.length) return json(null, 404, '账号不存在')
        const account = result.results[0] as unknown as ProviderAccount
        return json(account.provider === 'github' && legacyGithubToken(account.memo) ? {...account,memo:'',legacy_token_pending:true} : account, 200, '账号已更新')
    } catch (error) { return json(null, 409, '账号更新失败，请检查账号名称是否重复') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare("UPDATE provider_accounts SET status = '停用', updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *").bind(context.params.id).run<ProviderAccount>()
        if (!result.results?.length) return json(null, 404, '账号不存在')
        const account = result.results[0]
        return json(account.provider === 'github' && legacyGithubToken(account.memo) ? {...account,memo:'',legacy_token_pending:true} : account, 200, '账号已停用')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '账号停用失败') }
}
