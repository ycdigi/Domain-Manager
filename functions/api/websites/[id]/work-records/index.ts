import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { isWorkKind, type WorkRecord } from '../../../../../shared/website-management'
import { managementJson as json, managementError, positiveId, requestIdentity, workStats } from '../../../../domain/website-management'
export const onRequestGet: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const kind = new URL(context.request.url).searchParams.get('kind')
  if (kind && !isWorkKind(kind)) return json(null,400,'工作类型无效')
  const rows = await context.env.DB.prepare('SELECT * FROM website_work_records WHERE website_id=? AND voided_at IS NULL'+(kind?' AND kind=?':'')+' ORDER BY created_at DESC,id DESC').bind(Number(context.params.id),...(kind?[kind]:[])).all()
  return json(rows.results || [])
 } catch(error) { return managementError(error) }
}
export const onRequestPost: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const id = Number(context.params.id)
  const body = await context.request.json() as Record<string,unknown>
  if (!body || Object.keys(body).some(key => !['kind','request_id'].includes(key)) || !isWorkKind(body.kind) || !requestIdentity(body.request_id)) return json(null,400,'工作类型或记录编号无效')
  if (!positiveId(id) || !await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(id).first()) return json(null,404,'网站不存在')
  const inserted = await context.env.DB.prepare('INSERT INTO website_work_records(website_id,kind,request_id) VALUES(?,?,?) ON CONFLICT(website_id,request_id) DO NOTHING RETURNING *').bind(id,body.kind,body.request_id).first<WorkRecord>()
  const record = inserted || await context.env.DB.prepare('SELECT * FROM website_work_records WHERE website_id=? AND request_id=?').bind(id,body.request_id).first<WorkRecord>()
  if (!record || record.kind !== body.kind) return json(null,409,'记录编号已用于其他工作，请刷新后重试')
  return json({record,stats:await workStats(context.env.DB,id)},inserted?201:200,'工作已记录')
 } catch(error) { return managementError(error) }
}
