import type { Env, AdsenseIncome } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { isValidDate } from '../../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const validMonth = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
const validMoney = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9

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
        if (!Number.isInteger(data.adsense_account_id) || Number(data.adsense_account_id) <= 0 || !validMonth(data.income_month) || !validMoney(data.amount_usd ?? data.amount) || (data.amount_cny != null && !validMoney(data.amount_cny)) || (data.transfer_date != null && data.transfer_date !== '' && !isValidDate(data.transfer_date))) return json(null, 400, '账号、月份、金额或转账日期格式不正确')
        if (!await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(data.adsense_account_id).first()) return json(null, 400, 'AdSense 账号不存在')
        const amountUsd = data.amount_usd ?? data.amount
        const result = await context.env.DB.prepare(`INSERT INTO adsense_income (adsense_account_id, income_month, amount, amount_usd, amount_cny, transfer_date, memo)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(adsense_account_id, income_month) DO UPDATE SET amount=excluded.amount, amount_usd=excluded.amount_usd, amount_cny=excluded.amount_cny, transfer_date=excluded.transfer_date, memo=excluded.memo RETURNING *`)
            .bind(data.adsense_account_id, data.income_month, amountUsd, amountUsd, data.amount_cny ?? null, data.transfer_date || null, data.memo || '').first()
        return json(result, 200, '收入已保存')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '收入保存失败') }
}
