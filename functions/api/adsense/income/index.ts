import type { Env, AdsenseIncome } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { isValidDate } from '../../../utils/domain-validation'
const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
const validMoney = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9

const withSiteAmounts = async (db: D1Database, rows: AdsenseIncome[]) => {
    if (!rows.length) return rows
    const ids = rows.map(row => row.id).filter((id): id is number => Boolean(id))
    const sites = ids.length ? (await db.prepare(`SELECT x.income_id, x.domain_id, x.amount_usd, d.domain, d.site_name FROM adsense_income_domains x JOIN domains d ON d.id = x.domain_id WHERE x.income_id IN (${ids.map(() => '?').join(',')}) ORDER BY d.domain COLLATE NOCASE`).bind(...ids).all<{ income_id: number; domain_id: number; amount_usd: number; domain: string; site_name: string | null }>()).results : []
    return rows.map(row => ({ ...row, site_amounts: (sites || []).filter(site => site.income_id === row.id).map(({ income_id: _incomeId, ...site }) => site) }))
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const accountId = new URL(context.request.url).searchParams.get('account_id')
        if (accountId && !/^[1-9]\d*$/.test(accountId)) return json(null, 400, '账号编号无效')
        const sql = accountId ? 'SELECT * FROM adsense_income WHERE adsense_account_id=? ORDER BY income_month DESC' : 'SELECT * FROM adsense_income ORDER BY income_month DESC'
        const result = accountId ? await context.env.DB.prepare(sql).bind(accountId).all<AdsenseIncome>() : await context.env.DB.prepare(sql).all<AdsenseIncome>()
        return json(await withSiteAmounts(context.env.DB, result.results || []))
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取收入失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as AdsenseIncome & { site_amounts?: Array<{ domain_id: number; amount_usd: number }> }
        if (!Number.isInteger(data.adsense_account_id) || data.adsense_account_id <= 0 || !validMonth(data.income_month) || !validMoney(data.amount_usd ?? data.amount) || (data.amount_cny != null && !validMoney(data.amount_cny)) || (data.transfer_date != null && data.transfer_date !== '' && !isValidDate(data.transfer_date))) return json(null, 400, '账号、月份、金额或转账日期格式不正确')
        const account = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(data.adsense_account_id).first()
        if (!account) return json(null, 400, 'AdSense 账号不存在')
        const siteAmounts = data.site_amounts || []
        if (!Array.isArray(siteAmounts) || siteAmounts.some(site => !Number.isInteger(site.domain_id) || !validMoney(site.amount_usd)) || new Set(siteAmounts.map(site => site.domain_id)).size !== siteAmounts.length) return json(null, 400, '网站美元明细格式无效')
        if (siteAmounts.length) {
            const validSites = await context.env.DB.prepare(`SELECT id FROM domains WHERE adsense_account_id=? AND id IN (${siteAmounts.map(() => '?').join(',')})`).bind(data.adsense_account_id, ...siteAmounts.map(site => site.domain_id)).all<{ id: number }>()
            if ((validSites.results || []).length !== siteAmounts.length) return json(null, 400, '存在未关联当前 AdSense 账号的网站')
        }
        const amountUsd = data.amount_usd ?? data.amount
        const result = await context.env.DB.prepare(`INSERT INTO adsense_income (adsense_account_id, income_month, amount, amount_usd, amount_cny, transfer_date, memo) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(adsense_account_id, income_month) DO UPDATE SET amount=excluded.amount, amount_usd=excluded.amount_usd, amount_cny=excluded.amount_cny, transfer_date=excluded.transfer_date, memo=excluded.memo RETURNING *`).bind(data.adsense_account_id, data.income_month, amountUsd, amountUsd, data.amount_cny ?? null, data.transfer_date || null, data.memo || '').run<AdsenseIncome>()
        const income = result.results?.[0]
        if (!income?.id) return json(null, 500, '收入保存失败')
        await context.env.DB.prepare('DELETE FROM adsense_income_domains WHERE income_id=?').bind(income.id).run()
        if (siteAmounts.length) await context.env.DB.batch(siteAmounts.map(site => context.env.DB.prepare('INSERT INTO adsense_income_domains (income_id, domain_id, amount_usd) VALUES (?, ?, ?)').bind(income.id, site.domain_id, site.amount_usd)))
        return json(await withSiteAmounts(context.env.DB, [income]), 200, '收入已保存')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '收入保存失败') }
}
