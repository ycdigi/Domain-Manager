import type { Env } from '../types'
import { emptyWorkStats, isWorkKind, type WorkKind } from '../../shared/website-management'
export const managementJson = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
export const managementError = (error: unknown) => managementJson(null, error instanceof SyntaxError ? 400 : 500, error instanceof SyntaxError ? 'JSON 格式无效' : error instanceof Error ? error.message : '操作失败')
export const positiveId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0
export const requestIdentity = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value)
export const workStats = async (db: Env['DB'], id: number) => {
 const stats = emptyWorkStats()
 const rows = await db.prepare('SELECT kind,COUNT(*) AS count,MAX(created_at) AS last_at FROM website_work_records WHERE website_id=? AND voided_at IS NULL GROUP BY kind').bind(id).all<{kind:WorkKind;count:number;last_at:string}>()
 for (const row of rows.results || []) stats[row.kind] = {count:row.count,last_at:row.last_at}
 return stats
}
export const validateGscAccount = (body: Record<string, unknown>) => {
 if (!body || typeof body !== 'object' || Array.isArray(body)) return '账号资料无效'
 if (Object.keys(body).some(key => !['name','email'].includes(key))) return '账号包含不支持的字段'
 if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) return '账号名称必填且不能超过 120 个字符'
 if (typeof body.email !== 'string' || body.email.length > 254 || body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return '请输入有效邮箱，或留空'
 return null
}

// Validate the entire supplied collection before the import assembles any writes.
export const validateManagementBackup = (input: Record<string, any>, siteIds: Set<number>) => {
 const errors: Array<{domain:string;error:string}> = []
 const add = (domain:string,error:string) => errors.push({domain,error})
 const accountIds = new Set<number>(), names = new Set<string>(), emails = new Set<string>()
 const time = (value:unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && value.length<=40 && Number.isFinite(Date.parse(value))
 const validId = (id:unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id>0
 for (const [table,limit] of [['gsc_accounts',1000],['website_gsc_accounts',500],['website_work_records',100000]] as const) {
  if (input[table] !== undefined && (!Array.isArray(input[table]) || input[table].length>limit)) add(table,`记录必须为数组且最多 ${limit} 条`)
 }
 for (const row of Array.isArray(input.gsc_accounts)?input.gsc_accounts:[]) {
  const name = typeof row.name==='string'?row.name.trim().toLowerCase():''
  const email = typeof row.email==='string'?row.email.trim().toLowerCase():''
  if (!validId(row.id) || accountIds.has(row.id) || validateGscAccount({name:row.name,email:row.email}) || names.has(name) || email && emails.has(email) || row.created_at!=null && !time(row.created_at)) add('gsc_accounts','GSC 账号编号、名称、邮箱或时间无效或重复')
  accountIds.add(row.id); names.add(name); if(email)emails.add(email)
 }
 const linkedSites = new Set<number>()
 for (const row of Array.isArray(input.website_gsc_accounts)?input.website_gsc_accounts:[]) {
  if (!validId(row.website_id) || !siteIds.has(row.website_id) || !accountIds.has(row.account_id) || linkedSites.has(row.website_id)) add('website_gsc_accounts','账号关联必须指向备份中的网站和账号，且每站只能关联一个账号')
  linkedSites.add(row.website_id)
 }
 const ids = new Set<number>(), requests = new Set<string>()
 for (const row of Array.isArray(input.website_work_records)?input.website_work_records:[]) {
  const key = `${row.website_id}:${row.request_id}`
  if (!validId(row.id) || ids.has(row.id) || !siteIds.has(row.website_id) || !isWorkKind(row.kind) || !requestIdentity(row.request_id) || requests.has(key) || !time(row.created_at) || row.voided_at!=null && (!time(row.voided_at) || Date.parse(row.voided_at)<Date.parse(row.created_at))) add('website_work_records','工作记录的编号、类型、时间或网站关联无效或重复')
  ids.add(row.id);requests.add(key)
 }
 return errors
}
