import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { websiteIncomeRowsCte } from '../../../../domain/website-income'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const validMonth = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const rows = await context.env.DB.prepare(`
            ${websiteIncomeRowsCte}
            SELECT id, income_month, source, currency, amount, origin
            FROM website_income_rows
            WHERE website_id=?
            ORDER BY income_month DESC, source COLLATE NOCASE, currency COLLATE NOCASE
        `).bind(context.params.id).all()
        return json((rows.results || []).map(({ website_id: _websiteId, ...row }) => row))
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取网站收入失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id)
        if (!await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first()) return json(null, 404, '网站不存在')
        const body = await context.request.json() as Record<string, unknown>
        if (!validMonth(body.income_month) || typeof body.source !== 'string' || !body.source.trim() || body.source.length > 100 || typeof body.currency !== 'string' || !/^[A-Za-z]{3}$/.test(body.currency) || typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0) return json(null, 400, '月份、来源、三位币种代码和非负金额必填')
        const result = await context.env.DB.prepare(`
            INSERT INTO website_income (website_id, income_month, source, currency, amount, memo)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (website_id, income_month, source, currency) DO UPDATE SET amount=excluded.amount, memo=excluded.memo
            RETURNING *
        `).bind(websiteId, body.income_month, body.source.trim(), body.currency.toUpperCase(), body.amount, typeof body.memo === 'string' ? body.memo.slice(0, 2000) : null).first()
        return json(result, 201, '网站收入已保存')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '保存网站收入失败') }
}
