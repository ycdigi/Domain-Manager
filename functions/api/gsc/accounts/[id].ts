import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { managementJson as json, managementError, validateGscAccount } from '../../../domain/website-management'
export const onRequestPatch: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const body = await context.request.json() as Record<string,unknown>
  const error = validateGscAccount(body); if (error) return json(null,400,error)
  const name = String(body.name).trim(), email = String(body.email).trim().toLowerCase(), id = Number(context.params.id)
  if (await context.env.DB.prepare("SELECT id FROM gsc_accounts WHERE id<>? AND (name=? COLLATE NOCASE OR (?<>'' AND lower(email)=?))").bind(id,name,email,email).first()) return json(null,409,'账号名称或邮箱已存在')
  const result = await context.env.DB.prepare('UPDATE gsc_accounts SET name=?,email=? WHERE id=? RETURNING *').bind(name,email,id).first()
  return result ? json(result) : json(null,404,'GSC 账号不存在')
 } catch(error) { return managementError(error) }
}
export const onRequestDelete: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const id = Number(context.params.id)
  if (await context.env.DB.prepare('SELECT website_id FROM website_gsc_accounts WHERE account_id=? LIMIT 1').bind(id).first()) return json(null,409,'请先解除网站关联，再删除账号')
  const result = await context.env.DB.prepare('DELETE FROM gsc_accounts WHERE id=? RETURNING id').bind(id).first()
  return result ? json(null) : json(null,404,'GSC 账号不存在')
 } catch(error) { return managementError(error) }
}
