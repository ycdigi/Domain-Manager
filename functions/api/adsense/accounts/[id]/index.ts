import type { Env, AdsenseAccount } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isValidDate } from '../../../../utils/domain-validation'
const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const validPublisherId = (value: unknown) => value == null || value === '' || (typeof value === 'string' && /^pub-[A-Za-z0-9_-]{4,100}$/.test(value.trim()))

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as AdsenseAccount
        if (!data.name?.trim() || !data.owner?.trim() || !['USD', 'CNY', 'EUR', 'OTHER'].includes(data.currency) || !['正常', '暂停', '未知'].includes(data.status) || !validPublisherId(data.publisher_id) || (data.opened_date != null && data.opened_date !== '' && !isValidDate(data.opened_date))) return json(null, 400, '账号字段无效')
        const result = await context.env.DB.prepare(`UPDATE adsense_accounts SET name=?, owner=?, currency=?, status=?, publisher_id=?, opened_date=?, memo=? WHERE id=? RETURNING *`)
            .bind(data.name.trim(), data.owner.trim(), data.currency, data.status || '未知', data.publisher_id?.trim() || null, data.opened_date || null, data.memo || '', context.params.id).run<AdsenseAccount>()
        if (!result.results?.length) return json(null, 404, '账号不存在')
        return json(result.results[0], 200, '账号已更新')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '账号更新失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const result = await context.env.DB.prepare(`UPDATE adsense_accounts SET status='暂停' WHERE id=? RETURNING *`).bind(context.params.id).run<AdsenseAccount>()
        if (!result.results?.length) return json(null, 404, '账号不存在')
        return json(result.results[0], 200, '账号已停用')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '账号停用失败') }
}
