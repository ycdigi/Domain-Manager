import type { Env, AdsenseIncome } from '../../../types'
import { checkAuth } from '../../../utils/auth'
const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const accountId = new URL(context.request.url).searchParams.get('account_id')
        if (accountId && !/^[1-9]\d*$/.test(accountId)) return json(null, 400, '账号编号无效')
        const sql = accountId ? 'SELECT * FROM adsense_income WHERE adsense_account_id=? ORDER BY income_month DESC' : 'SELECT * FROM adsense_income ORDER BY income_month DESC'
        const result = accountId ? await context.env.DB.prepare(sql).bind(accountId).all<AdsenseIncome>() : await context.env.DB.prepare(sql).all<AdsenseIncome>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取收入失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as AdsenseIncome
        if (!Number.isInteger(data.adsense_account_id) || data.adsense_account_id <= 0 || !validMonth(data.income_month) || typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount < 0) return json(null, 400, '账号、月份或金额格式不正确')
        const result = await context.env.DB.prepare(`INSERT INTO adsense_income (adsense_account_id, income_month, amount, memo) VALUES (?, ?, ?, ?) ON CONFLICT(adsense_account_id, income_month) DO UPDATE SET amount=excluded.amount, memo=excluded.memo RETURNING *`)
            .bind(data.adsense_account_id, data.income_month, data.amount, data.memo || '').run<AdsenseIncome>()
        return json(result.results?.[0] || null, 200, '收入已保存')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '收入保存失败') }
}
