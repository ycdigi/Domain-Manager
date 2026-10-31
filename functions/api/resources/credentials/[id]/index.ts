import type { Env, ProviderCredential } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { decryptCredential, encryptCredential } from '../../../../utils/credentials'
import { isValidDate } from '../../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const record = await context.env.DB.prepare('SELECT c.id, c.ciphertext FROM provider_credentials c JOIN provider_accounts a ON a.id = c.account_id WHERE c.id = ? AND a.provider = \'github\'').bind(context.params.id).first<{ ciphertext: string; id: number }>()
        if (!record) return json(null, 404, '凭据不存在')
        const token = await decryptCredential(record.ciphertext, context.env.CREDENTIAL_ENCRYPTION_KEY)
        return json({ id: record.id, token }, 200, '凭据读取成功')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '凭据读取失败') }
}

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as { label?: string; token?: string; expires_at?: string | null; status?: string }
        if (!data.label?.trim() || data.label.length > 100 || (data.token !== undefined && data.token.length > 8192)) return json(null, 400, '凭据名称或 Token 格式无效')
        if (data.expires_at && !isValidDate(data.expires_at)) return json(null, 400, '凭据到期日期格式无效')
        const existing = await context.env.DB.prepare('SELECT c.ciphertext FROM provider_credentials c JOIN provider_accounts a ON a.id = c.account_id WHERE c.id = ? AND a.provider = \'github\'').bind(context.params.id).first<{ ciphertext: string }>()
        if (!existing) return json(null, 404, '凭据不存在')
        const ciphertext = data.token ? await encryptCredential(data.token, context.env.CREDENTIAL_ENCRYPTION_KEY) : existing.ciphertext
        const last4 = data.token ? data.token.slice(-4) : undefined
        const result = await context.env.DB.prepare(`
            UPDATE provider_credentials SET label = ?, ciphertext = ?, token_last4 = COALESCE(?, token_last4), expires_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? RETURNING id, account_id, label, token_last4, expires_at, status, created_at, updated_at
        `).bind(data.label.trim(), ciphertext, last4 || null, data.expires_at || null, data.status || '有效', context.params.id).run<ProviderCredential>()
        return json(result.results?.[0] || null, 200, '凭据已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '凭据更新失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        await context.env.DB.prepare('DELETE FROM provider_credentials WHERE id = ?').bind(context.params.id).run()
        return json(null, 200, '凭据已删除')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '凭据删除失败') }
}
