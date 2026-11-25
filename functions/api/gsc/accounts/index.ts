import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { managementJson as json, managementError, validateGscAccount } from '../../../domain/website-management'
export const onRequestGet: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try { return json((await context.env.DB.prepare('SELECT a.*,COUNT(l.website_id) AS linked_websites FROM gsc_accounts a LEFT JOIN website_gsc_accounts l ON l.account_id=a.id GROUP BY a.id ORDER BY a.name').all()).results || []) } catch(error) { return managementError(error) }
}
export const onRequestPost: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const body = await context.request.json() as Record<string,unknown>
  const error = validateGscAccount(body); if (error) return json(null,400,error)
  const name = String(body.name).trim(), email = String(body.email).trim().toLowerCase()
  const result = await context.env.DB.prepare('INSERT INTO gsc_accounts(name,email) VALUES(?,?) ON CONFLICT DO NOTHING RETURNING *').bind(name,email).first()
  return result ? json(result,201,'GSC 账号已添加') : json(null,409,'账号名称或邮箱已存在')
 } catch(error) { return managementError(error) }
}
