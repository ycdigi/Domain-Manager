import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { managementJson as json, managementError, workStats } from '../../../../domain/website-management'
export const onRequestDelete: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const id = Number(context.params.id), recordId = Number(context.params.record_id)
  const record = await context.env.DB.prepare("UPDATE website_work_records SET voided_at=COALESCE(voided_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE website_id=? AND id=? RETURNING *").bind(id,recordId).first()
  if (!record) return json(null,404,'记录不存在')
  return json({record,stats:await workStats(context.env.DB,id)},200,'已撤销记录')
 } catch(error) { return managementError(error) }
}
