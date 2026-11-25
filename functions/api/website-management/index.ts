import { checkAuth } from '../../utils/auth'
import type { Env } from '../../types'
import { emptyWorkStats, type WorkKind, type ManagementRow } from '../../../shared/website-management'
import { managementJson as json, managementError } from '../../domain/website-management'
export const onRequestGet: PagesFunction<Env> = async context => {
 const auth = await checkAuth(context); if (auth) return auth
 try {
  const [sites, totals] = await Promise.all([
   context.env.DB.prepare(`SELECT w.id,w.name,w.lifecycle,d.domain,g.id AS account_id,g.name AS account_name,g.email AS account_email,g.created_at AS account_created_at FROM websites w LEFT JOIN domains d ON d.website_id=w.id AND d.is_primary=1 LEFT JOIN website_gsc_accounts l ON l.website_id=w.id LEFT JOIN gsc_accounts g ON g.id=l.account_id ORDER BY w.priority_order,w.id`).all(),
   context.env.DB.prepare('SELECT website_id,kind,COUNT(*) AS count,MAX(created_at) AS last_at FROM website_work_records WHERE voided_at IS NULL GROUP BY website_id,kind').all<{website_id:number;kind:WorkKind;count:number;last_at:string}>()
  ])
  const rows = (sites.results || []).map((row: any): ManagementRow => ({id:row.id,name:row.name,lifecycle:row.lifecycle,domain:row.domain,gsc_account:row.account_id ? {id:row.account_id,name:row.account_name,email:row.account_email,created_at:row.account_created_at} : null,stats:emptyWorkStats()}))
  const byId = new Map(rows.map(row => [row.id,row]))
  for (const total of totals.results || []) { const row = byId.get(total.website_id); if (row) row.stats[total.kind] = {count:total.count,last_at:total.last_at} }
  return json(rows)
 } catch(error) { return managementError(error) }
}
