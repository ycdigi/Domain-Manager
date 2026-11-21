import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
export const onRequestGet: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    const websiteId = new URL(context.request.url).searchParams.get('website_id')
    const query = context.env.DB.prepare(`SELECT wa.*, a.name AS account_name, a.provider, a.provider_name, a.login_email, w.name AS website_name FROM website_accounts wa JOIN provider_accounts a ON a.id=wa.account_id JOIN websites w ON w.id=wa.website_id ${websiteId ? 'WHERE wa.website_id=?' : ''} ORDER BY a.provider,a.name,w.name`)
    return json((await (websiteId ? query.bind(websiteId) : query).all()).results)
}
export const onRequestPost: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    const input = await context.request.json() as { website_id?: number; account_id?: number; memo?: string }
    if (!Number.isSafeInteger(input.website_id) || !Number.isSafeInteger(input.account_id) || (input.memo != null && (typeof input.memo !== 'string' || input.memo.length > 2000))) return json(null, 400, '网站、账号或备注无效')
    const db = context.env.DB
    const account = await db.prepare('SELECT status FROM provider_accounts WHERE id=?').bind(input.account_id).first<{ status: string }>()
    if (!account || account.status === '停用' || !await db.prepare('SELECT id FROM websites WHERE id=?').bind(input.website_id).first()) return json(null, 400, '网站或可用账号不存在')
    const row = await db.prepare(`INSERT INTO website_accounts(website_id,account_id,memo) VALUES (?,?,?) ON CONFLICT(website_id,account_id) DO UPDATE SET memo=excluded.memo RETURNING *`).bind(input.website_id, input.account_id, input.memo?.trim() || '').first()
    return json(row, 201, '账号已关联；托管和仓库仍需关联具体资源')
}
export const onRequestDelete: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    const id = Number(new URL(context.request.url).searchParams.get('id'))
    if (!Number.isSafeInteger(id) || id < 1) return json(null, 400, '关联编号无效')
    await context.env.DB.prepare('DELETE FROM website_accounts WHERE id=?').bind(id).run()
    return json(null)
}
