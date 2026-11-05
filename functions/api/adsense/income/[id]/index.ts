import type { Env, AdsenseIncome } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isValidDate } from '../../../../utils/domain-validation'
export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as AdsenseIncome
        const amountUsd = data.amount_usd ?? data.amount
        const validMoney = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
        if (!validMoney(amountUsd) || (data.amount_cny != null && !validMoney(data.amount_cny)) || (data.transfer_date && !isValidDate(data.transfer_date))) return Response.json({ status: 400, message: '金额或转账日期格式无效', data: null }, { status: 400 })
        const result = await context.env.DB.prepare('UPDATE adsense_income SET amount=?, amount_usd=?, amount_cny=?, transfer_date=?, memo=? WHERE id=? RETURNING *').bind(amountUsd, amountUsd, data.amount_cny ?? null, data.transfer_date || null, data.memo || '', context.params.id).run<AdsenseIncome>()
        if (!result.results?.length) return Response.json({ status: 404, message: '收入记录不存在', data: null }, { status: 404 })
        return Response.json({ status: 200, message: '收入已更新', data: result.results[0] })
    } catch (error) { return Response.json({ status: 500, message: error instanceof Error ? error.message : '收入更新失败', data: null }, { status: 500 }) }
}
