export const workKinds = ['TDK调整', '计算器开发', '文章开发', '样式调整'] as const
export type WorkKind = typeof workKinds[number]
export type WorkStats = Record<WorkKind, { count: number; last_at: string | null }>
export interface WorkRecord { id: number; website_id: number; kind: WorkKind; request_id: string; created_at: string; voided_at: string | null }
export interface GscAccount { id: number; name: string; email: string; created_at: string; linked_websites?: number }
export interface ManagementRow { id: number; name: string; domain: string | null; lifecycle: string; batch_ids: number[]; gsc_account: GscAccount | null; stats: WorkStats }
export const emptyWorkStats = (): WorkStats => Object.fromEntries(workKinds.map(kind => [kind, { count: 0, last_at: null }])) as WorkStats
export const isWorkKind = (value: unknown): value is WorkKind => typeof value === 'string' && workKinds.includes(value as WorkKind)

// Excel is derived from the same snapshot as its history sheets, never a second live read.
export const managementExportRows = (snapshot: Record<string, any>) => {
 const stats = new Map<number,WorkStats>()
 for (const record of (snapshot.website_work_records || []) as WorkRecord[]) {
  if (record.voided_at) continue
  if (!stats.has(record.website_id)) stats.set(record.website_id,emptyWorkStats())
  const item=stats.get(record.website_id)![record.kind];item.count++;if(!item.last_at || record.created_at>item.last_at)item.last_at=record.created_at
 }
 const accountById=new Map<number,GscAccount>((snapshot.gsc_accounts || []).map((row:GscAccount)=>[row.id,row]))
 const accountBySite=new Map<number,number>((snapshot.website_gsc_accounts || []).map((row:{website_id:number;account_id:number})=>[row.website_id,row.account_id]))
 const domainBySite=new Map<number,string>((snapshot.domains || []).filter((row:{is_primary:number})=>row.is_primary).map((row:{website_id:number;domain:string})=>[row.website_id,row.domain]))
 return (snapshot.websites || []).map((site:{id:number;name:string})=>{
  const account=accountById.get(accountBySite.get(site.id) || 0), summary=stats.get(site.id) || emptyWorkStats()
  return {网站名称:site.name,网站域名:domainBySite.get(site.id) || '',...Object.fromEntries(workKinds.flatMap(kind=>[[kind+'次数',summary[kind].count],[kind+'最近时间UTC',summary[kind].last_at || '']])),GSC归属:account?.name || '',GSC邮箱:account?.email || ''}
 })
}
