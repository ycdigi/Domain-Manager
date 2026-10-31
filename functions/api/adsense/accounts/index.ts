import type { Env, AdsenseAccount } from '../../../types'
import { checkAuth } from '../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const requestedMonth = new URL(context.request.url).searchParams.get('month')
        const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
            ? requestedMonth
            : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())
        const result = await context.env.DB.prepare(`
            SELECT a.*, COUNT(DISTINCT d.id) AS linked_domains,
                   COALESCE((SELECT SUM(i.amount) FROM adsense_income i WHERE i.adsense_account_id = a.id AND i.income_month = ?), 0) AS current_income
            FROM adsense_accounts a
            LEFT JOIN domains d ON d.adsense_account_id = a.id
            GROUP BY a.id ORDER BY a.name COLLATE NOCASE
        `).bind(month).all<AdsenseAccount>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 AdSense 账号失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as AdsenseAccount
        if (!data.name?.trim() || !data.owner?.trim()) return json(null, 400, '账号名称和归属人不能为空')
        if (!['USD', 'CNY', 'EUR', 'OTHER'].includes(data.currency) || !['正常', '暂停', '未知'].includes(data.status || '未知')) return json(null, 400, '货币或账号状态不支持')
        const result = await context.env.DB.prepare(`INSERT INTO adsense_accounts (name, owner, currency, status, memo) VALUES (?, ?, ?, ?, ?) RETURNING *`)
            .bind(data.name.trim(), data.owner.trim(), data.currency, data.status || '未知', data.memo || '').run<AdsenseAccount>()
        return json(result.results?.[0] || null, 201, '账号创建成功')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '账号创建失败') }
}
