import { computed } from 'vue'
import { api, ApiError } from '../utils/request'
import { cachedGet, cachedValue, invalidateData } from '../utils/workspaceCache'

export type MonitorStatus = 'healthy' | 'pending' | 'failure' | 'review' | 'incomplete' | 'unchecked' | 'disabled'
export interface Monitor {
  website_id: number; website_name: string; domain: string | null; domain_id: number | null
  enabled: boolean; effective_enabled: boolean; status: MonitorStatus; reason: string | null
  http_status: number | null; response_ms: number | null; final_url: string | null; title: string | null
  baseline_title: string | null; checked_at: string | null; next_check_at: string | null
  required_text: string[]; forbidden_text: string[]; allowed_redirect_hosts: string[]; consecutive_failures: number
}
export interface Check {
  id: number; website_id: number; domain: string; checked_at: string; outcome: string; reason: string | null
  http_status: number | null; response_ms: number | null; final_url: string | null; title: string | null; content_complete: boolean
}
export interface Incident {
  id: number; website_id: number; website_name?: string; domain: string; reason: string
  opened_at: string; last_seen_at: string; resolved_at: string | null; read_at: string | null
}
export interface MonitorOverview {
  monitors: Monitor[]; incidents: Incident[]; unread_count: number
  runner: { last_started_at: string | null; last_completed_at: string | null; last_error: string | null } | null
}
export interface MonitorDetail { monitor: Monitor; history: Check[]; incidents: Incident[] }
export type MonitorConfig = Pick<Monitor, 'enabled' | 'required_text' | 'forbidden_text' | 'allowed_redirect_hosts' | 'baseline_title'>
export const monitorOverview = computed(() => cachedValue<MonitorOverview>('/api/monitor').value)
export const getMonitorOverview = (force = false) => cachedGet<MonitorOverview>('/api/monitor', force)
export const getWebsiteMonitor = (id: number, force = false) => cachedGet<MonitorDetail>(`/api/websites/${id}/monitor`, force)
const changed = async (id?: number) => {
  invalidateData('/api/monitor', ...(id ? [`/api/websites/${id}/monitor`] : []))
  await getMonitorOverview(true).catch(() => {})
}
export const updateMonitor = async (id: number, config: Partial<MonitorConfig>) => {
  const result = await api.patch<MonitorDetail>(`/api/websites/${id}/monitor`, config)
  await changed(id)
  cachedValue<MonitorDetail>(`/api/websites/${id}/monitor`).value = result
  return result
}
export const checkMonitor = async (id: number) => {
  const result = await api.post<MonitorDetail>(`/api/websites/${id}/monitor/check`)
  await changed(id)
  cachedValue<MonitorDetail>(`/api/websites/${id}/monitor`).value = result
  return result
}
export const readIncident = async (id: number) => {
  const websiteId = monitorOverview.value?.incidents.find(incident => incident.id === id)?.website_id
  await api.post(`/api/monitor/incidents/${id}/read`)
  await changed(websiteId)
}
export const monitorLabels: Record<MonitorStatus, string> = { healthy: '正常', pending: '待确认', failure: '异常', review: '待复核', incomplete: '内容检查未完成', unchecked: '未检查', disabled: '已停用' }
export const monitorTone = (status: string): 'success' | 'danger' | 'warning' | 'info' => status === 'healthy' ? 'success' : status === 'failure' ? 'danger' : ['pending', 'review', 'incomplete'].includes(status) ? 'warning' : 'info'
export const monitorError = (error: unknown) => error instanceof ApiError && error.status === 409 ? '正在检查，请稍后重试' : error instanceof Error ? error.message : '监控请求失败，请重试'
export const monitorTime = (value: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z')) : '—'

const reasonLabels: Record<string, string> = {
  invalid_url: '网址无效', unsafe_host_or_url: '网址或主机不安全',
  redirect_location_missing: '跳转缺少目标地址', redirect_location_invalid: '跳转目标地址无效',
  https_downgrade: '跳转降级为 HTTP', unsafe_redirect_host_or_url: '跳转网址或主机不安全',
  cross_domain_redirect: '跳转到未允许的域名', redirect_loop: '循环跳转', redirect_limit: '跳转次数过多',
  http_error: 'HTTP 请求异常', unsupported_content_type: '内容类型不支持', body_size_limit: '页面内容超过大小限制',
  content_extraction_limit: '页面内容过于复杂，内容检查未完成',
  html_extraction_limit: '页面内容过于复杂，内容检查未完成',
  forbidden_text_found: '发现禁止包含的文本', required_text_missing: '缺少必须包含的文本', title_changed: '标题发生变化',
  healthy: '检查正常', timeout: '请求超时', request_aborted: '请求已中止', body_read_error: '页面内容读取失败', network_error: '网络连接异常'
}
export const monitorReason = (reason: string | null, httpStatus?: number | null) => {
  if (!reason) return '—'
  if (reason === 'http_error' && (httpStatus === 403 || httpStatus === 429)) return `访问受限（HTTP ${httpStatus}）`
  return (reasonLabels[reason] || reason) + (reason === 'http_error' && httpStatus != null ? `（HTTP ${httpStatus}）` : '')
}

export const monitorNextCheck = (monitor: Monitor) => {
  if (!monitor.effective_enabled) return '—'
  if (monitor.status === 'unchecked' && (!monitor.next_check_at || new Date(monitor.next_check_at).getUTCFullYear() === 1970)) return '等待首次调度'
  return monitorTime(monitor.next_check_at)
}
