import { api } from '../utils/request'
import { cachedGet, invalidateData } from '../utils/workspaceCache'
import type { ManagementRow, GscAccount, WorkKind, WorkRecord, WorkStats } from '../../shared/website-management'
export type { ManagementRow, GscAccount, WorkKind, WorkRecord, WorkStats }
export interface RecordResult { record: WorkRecord; stats: WorkStats }
export const getManagement = (force=false) => cachedGet<ManagementRow[]>('/api/website-management',force)
export const getGscAccounts = (force=false) => cachedGet<GscAccount[]>('/api/gsc/accounts',force)
export const getWorkRecords = (id:number,kind?:WorkKind) => api.get<WorkRecord[]>(`/api/websites/${id}/work-records${kind?'?kind='+encodeURIComponent(kind):''}`)
const changed = () => invalidateData('/api/website-management','/api/gsc/accounts')
export const recordWork = async (id:number,kind:WorkKind,requestId:string) => { const result=await api.post<RecordResult>(`/api/websites/${id}/work-records`,{kind,request_id:requestId});changed();return result }
export const undoWork = async (id:number,recordId:number) => { const result=await api.delete<RecordResult>(`/api/websites/${id}/work-records/${recordId}`);changed();return result }
export const assignGsc = async (id:number,accountId:number|null) => { const result=await api.patch<GscAccount|null>(`/api/websites/${id}/gsc-account`,{account_id:accountId});changed();return result }
export const saveGscAccount = async (id:number|undefined,body:{name:string;email:string}) => { const result=id?await api.patch<GscAccount>(`/api/gsc/accounts/${id}`,body):await api.post<GscAccount>('/api/gsc/accounts',body);changed();return result }
export const removeGscAccount = async (id:number) => { await api.delete(`/api/gsc/accounts/${id}`);changed() }
export const workTime = (value:string|null|undefined,short=false) => {
 if (!value || !Number.isFinite(Date.parse(value))) return '—'
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(part=>[part.type,part.value]))
 return short?`${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`:`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}
