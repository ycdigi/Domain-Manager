import type { Env, AdsenseIncome } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as AdsenseIncome
        if (typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount < 0) return Response.json({ status: 400, message: '金额必须是非负数字', data: null }, { status: 400 })
        const result = await context.env.DB.prepare('UPDATE adsense_income SET amount=?, memo=? WHERE id=? RETURNING *').bind(data.amount, data.memo || '', context.params.id).run<AdsenseIncome>()
        if (!result.results?.length) return Response.json({ status: 404, message: '收入记录不存在', data: null }, { status: 404 })
        return Response.json({ status: 200, message: '收入已更新', data: result.results[0] })
    } catch (error) { return Response.json({ status: 500, message: error instanceof Error ? error.message : '收入更新失败', data: null }, { status: 500 }) }
}
