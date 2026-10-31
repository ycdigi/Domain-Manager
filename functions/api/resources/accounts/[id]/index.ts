import type { Env, ProviderAccount } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Partial<ProviderAccount>
        if (!data.name?.trim() || data.name.length > 120 || (data.status && !['正常', '停用', '未知'].includes(data.status)) || (data.login_email && data.login_email.length > 254)) return json(null, 400, '账号名称、邮箱或状态无效')
        const result = await context.env.DB.prepare(`
            UPDATE provider_accounts SET name = ?, login_email = ?, status = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? RETURNING *
        `).bind(data.name.trim(), data.login_email || null, data.status || '正常', data.memo || '', context.params.id).run<ProviderAccount>()
        if (!result.results?.length) return json(null, 404, '账号不存在')
        return json(result.results[0], 200, '账号已更新')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '账号更新失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare("UPDATE provider_accounts SET status = '停用', updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *").bind(context.params.id).run<ProviderAccount>()
        if (!result.results?.length) return json(null, 404, '账号不存在')
        return json(result.results[0], 200, '账号已停用')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '账号停用失败') }
}
