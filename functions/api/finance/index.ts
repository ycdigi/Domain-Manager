import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { websiteIncomeRowsCte } from '../../domain/website-income'
export const onRequestGet: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    try {
        const db = context.env.DB
        const [sites, income, effort] = await Promise.all([
            db.prepare('SELECT id,name FROM websites ORDER BY name COLLATE NOCASE').all(),
            db.prepare(`${websiteIncomeRowsCte} SELECT id,website_id,income_month,source,currency,amount,origin FROM website_income_rows ORDER BY website_id,income_month DESC,source COLLATE NOCASE,currency COLLATE NOCASE`).all(),
            db.prepare('SELECT id,website_id,week_start,hours,memo FROM website_effort ORDER BY week_start DESC,website_id').all()
        ])
        return Response.json({ status: 200, message: '成功', data: { websites: sites.results, website_income: income.results, website_effort: effort.results } })
    } catch (error) { return Response.json({ status: 500, message: error instanceof Error ? error.message : '财务读取失败', data:null }, {status:500}) }
}
