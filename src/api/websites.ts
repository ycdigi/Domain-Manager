import { api } from '../utils/request'
import { cachedGet, invalidateData } from '../utils/workspaceCache'

export type WebsiteStage = '待评估' | '验证' | '增长' | '维护' | '暂停'
export type WebsiteTaskType = 'SEO' | '内容' | '技术' | '其他' | 'SEO复查'
export type WebsiteTaskStatus = '待做' | '处理中' | '已完成' | '待跟进'

export interface WebsiteDomain {
  id: number
  website_id: number
  domain: string
  domain_role: '主域名' | '跳转域名' | '备用域名'
  is_primary: number
  registrar: string
  registrar_link?: string | null
  registrar_date: string
  expiry_date: string
  service_type: string
  status: '在线' | '离线'
  memo?: string | null
  last_status_check_at?: string | null
}

export interface Website {
  id: number
  name: string
  stage: WebsiteStage
  lifecycle: 'active' | 'stopped'
  ownership: '未分类' | '自营网站' | '企业客户网站'
  industry: '计算器' | '资讯站' | '其他' | null
  platform: 'WordPress' | 'Astro' | 'Next.js' | '其他'
  platform_other?: string | null
  adsense_account_id?: number | null
  adsense_connected: '未知' | '已开通' | '未开通'
  adsense_opened_date?: string | null
  gsc_connected: '未知' | '已开通' | '未开通'
  daily_clicks?: number | null
  daily_clicks_range?: string | null
  clicks_updated_date?: string | null
  wp_calculator_count?: number | null
  wp_article_count?: number | null
  content_stats_updated_date?: string | null
  potential?: string | null
  priority_order: number
  next_action?: string | null
  next_action_due_date?: string | null
  next_action_status: '待做' | '处理中' | '已完成'
  domains: WebsiteDomain[]
  open_task_count?: number
  review_count?: number
  resource_names?: string | null
  resource_ids?: number[]
  provider_account_ids?: number[]
  current_income?: Array<{ source: string; currency: string; amount: number }>
  latest_effort?: { week_start: string; hours: number } | null
}

export interface WebsiteTask {
  id: number
  website_id: number
  task_type: WebsiteTaskType
  title: string
  description?: string | null
  status: WebsiteTaskStatus
  completion_summary?: string | null
  result_url?: string | null
  due_at?: string | null
  completed_at?: string | null
  review_of_task_id?: number | null
  review_delay_days: number
  review_window_days: number
  review_conclusion?: '提升' | '持平' | '下降' | '数据不足' | null
  review_basis?: string | null
  baseline_missing: number
  snapshots?: Array<{ period_kind: 'before' | 'after'; period_start: string; period_end: string; clicks: number }>
}

export const getWebsites = (force = false) => cachedGet<Website[]>('/api/websites', force)
export const createWebsite = async (body: Record<string, unknown>) => { const result = await api.post<{ website: Website; domains: WebsiteDomain[] }>('/api/websites', body); invalidateData('/api/websites'); return result }
export const updateWebsite = async (id: number, fields: Record<string, unknown>) => { const result = await api.patch<Website>(`/api/websites/${id}`, fields); invalidateData('/api/websites'); return result }
export const deleteWebsite = async (id: number) => { const result = await api.delete(`/api/websites/${id}`); invalidateData('/api/websites'); return result }
