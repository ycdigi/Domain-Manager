import type { Env, ProviderCredential } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { encryptCredential } from '../../../utils/credentials'
import { isValidDate } from '../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const accountId = new URL(context.request.url).searchParams.get('account_id')
        const sql = `SELECT id, account_id, label, token_last4, expires_at, status, created_at, updated_at FROM provider_credentials ${accountId ? 'WHERE account_id = ?' : ''} ORDER BY created_at DESC`
        const result = accountId ? await context.env.DB.prepare(sql).bind(accountId).all<ProviderCredential>() : await context.env.DB.prepare(sql).all<ProviderCredential>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取凭据失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as { account_id?: number; label?: string; token?: string; expires_at?: string | null; status?: string }
        if (!Number.isInteger(data.account_id) || !data.label?.trim() || data.label.length > 100 || !data.token || data.token.length > 8192) return json(null, 400, '账号、名称或 Token 格式无效')
        if (data.expires_at && !isValidDate(data.expires_at)) return json(null, 400, '凭据到期日期格式无效')
        const account = await context.env.DB.prepare('SELECT provider FROM provider_accounts WHERE id = ?').bind(data.account_id).first<{ provider: string }>()
        if (!account || account.provider !== 'github') return json(null, 400, '凭据目前仅支持 GitHub 账号')
        const ciphertext = await encryptCredential(data.token, context.env.CREDENTIAL_ENCRYPTION_KEY)
        const result = await context.env.DB.prepare(`
            INSERT INTO provider_credentials (account_id, label, ciphertext, token_last4, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id, account_id, label, token_last4, expires_at, status, created_at, updated_at
        `).bind(data.account_id, data.label.trim(), ciphertext, data.token.slice(-4), data.expires_at || null, data.status || '有效').run<ProviderCredential>()
        return json(result.results?.[0] || null, 201, '凭据已保存')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '凭据保存失败') }
}
