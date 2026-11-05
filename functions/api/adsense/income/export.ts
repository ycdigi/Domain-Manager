import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context)
    if (authError) return authError
    try {
        const { results } = await context.env.DB.prepare(`
            SELECT a.name AS adsense_account, a.owner, a.publisher_id, a.currency, i.income_month, CASE WHEN i.amount_usd = 0 AND i.amount <> 0 THEN i.amount ELSE i.amount_usd END AS amount_usd, i.amount_cny, i.transfer_date, i.memo
            FROM adsense_income i
            JOIN adsense_accounts a ON a.id = i.adsense_account_id
            ORDER BY i.income_month DESC, a.name COLLATE NOCASE
        `).all()
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        return new Response(JSON.stringify(results || [], null, 2), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="adsense-income-${date}.json"`
            }
        })
    } catch {
        return Response.json({ status: 500, message: 'AdSense 收入导出失败', data: null }, { status: 500 })
    }
}
