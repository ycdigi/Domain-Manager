import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { managementJson as json, managementError, positiveId } from '../../../domain/website-management'
export const onRequestPatch: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const body = await context.request.json() as Record<string,unknown>, id = Number(context.params.id)
  if (!body || Object.keys(body).length !== 1 || !('account_id' in body) || body.account_id !== null && (!Number.isSafeInteger(body.account_id) || !positiveId(body.account_id))) return json(null,400,'GSC 账号编号无效')
  if (!await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(id).first()) return json(null,404,'网站不存在')
  if (body.account_id === null) { await context.env.DB.prepare('DELETE FROM website_gsc_accounts WHERE website_id=?').bind(id).run(); return json(null) }
  const account = await context.env.DB.prepare('SELECT * FROM gsc_accounts WHERE id=?').bind(body.account_id).first()
  if (!account) return json(null,400,'GSC 账号不存在')
  await context.env.DB.prepare('INSERT INTO website_gsc_accounts(website_id,account_id) VALUES(?,?) ON CONFLICT(website_id) DO UPDATE SET account_id=excluded.account_id').bind(id,body.account_id).run()
  return json(account)
 } catch(error) { return managementError(error) }
}
