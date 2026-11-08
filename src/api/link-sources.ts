import { api } from '../utils/request'
import { cachedGet, invalidateData } from '../utils/workspaceCache'

export const linkSourceTypes = ['搜索页', 'SEO 查询页', '工具目录', '行业资源页', '社区页面', '可能的提交页', '无法判断'] as const
export const linkSubmissionModes = ['人工提交', '允许自动处理', '仅观察'] as const
export const linkSourceApprovalStatuses = ['待审核', '已批准', '已暂停', '已拒绝', '已失效'] as const
export const linkOpportunityStatuses = ['待审核', '待处理', '已生成提交地址', '请求已完成', '已提交待审核', '已确认公开链接', '被拒绝', '来源失效', '请求失败', '需要人工处理', '已暂停'] as const
export const linkSourceFunnelStages = ['未检查', '待筛选', '建议保留', '已保留', '待删除', '已排除'] as const
export const linkSourceCheckStatuses = ['未检查', '可访问', '重定向', '404', '受阻', '超时', '错误', '需要人工验证'] as const
export const linkOpportunityManualStatuses = ['待审核', '待处理', '已生成提交地址', '已暂停'] as const

export type LinkSourceType = typeof linkSourceTypes[number]
export type LinkSubmissionMode = typeof linkSubmissionModes[number]
export type LinkSourceApprovalStatus = typeof linkSourceApprovalStatuses[number]
export type LinkOpportunityStatus = typeof linkOpportunityStatuses[number]
export type LinkSourceFunnelStage = typeof linkSourceFunnelStages[number]
export type LinkSourceCheckStatus = typeof linkSourceCheckStatuses[number]

export interface LinkSource {
  id: number
  name: string
  source_url: string
  source_type: LinkSourceType
  country?: string | null
  language?: string | null
  topic_tags?: string | null
  url_template?: string | null
  submission_mode: LinkSubmissionMode
  approval_status: LinkSourceApprovalStatus
  enabled: number
  audit_flags?: string | null
  last_checked_at?: string | null
  memo?: string | null
  opportunity_count?: number
  funnel_stage?: LinkSourceFunnelStage
  check_status?: LinkSourceCheckStatus
  http_status?: number | null
  checked_url?: string | null
  check_error_message?: string | null
  checked_at?: string | null
}

export interface LinkSourceReviewRun {
  id: number
  planned_count: number
  completed_count: number
  failed_count: number
  status: '未运行' | '运行中' | '已完成' | '部分完成' | '失败'
  started_at?: string | null
  completed_at?: string | null
  updated_at?: string
}

export interface WebsiteLinkOpportunity {
  id: number
  website_id: number
  source_id: number
  target_url: string
  status: LinkOpportunityStatus
  submission_url?: string | null
  title?: string | null
  description?: string | null
  anchor_text?: string | null
  next_run_at?: string | null
  last_attempt_at?: string | null
  evidence_url?: string | null
  last_error?: string | null
  memo?: string | null
  source_name?: string
  source_url?: string
  url_template?: string | null
  source_type?: LinkSourceType
  country?: string | null
  language?: string | null
  submission_mode?: LinkSubmissionMode
  approval_status?: LinkSourceApprovalStatus
  source_enabled?: number
}

export interface LinkAttempt {
  id: number
  opportunity_id: number
  attempted_at: string
  method: '人工' | '自动'
  request_status: '已完成' | '失败' | '需要人工'
  result_status?: '已提交待审核' | '被拒绝' | '来源失效' | null
  http_status?: number | null
  confirmed_public_link: number
  error_message?: string | null
  response_summary?: string | null
  evidence_url?: string | null
}

export const getLinkSources = (force = false) => cachedGet<LinkSource[]>('/api/link-sources', force)
export const createLinkSource = async (body: Record<string, unknown>) => { const result = await api.post<LinkSource>('/api/link-sources', body); invalidateData('/api/link-sources'); return result }
export const updateLinkSource = async (id: number, body: Record<string, unknown>) => { const result = await api.patch<LinkSource>(`/api/link-sources/${id}`, body); invalidateData('/api/link-sources'); return result }
export const deleteLinkSource = async (id: number) => { const result = await api.delete(`/api/link-sources/${id}`); invalidateData('/api/link-sources'); return result }
export const importLinkSources = async (rows: Array<Record<string, unknown>>) => { const result = await api.post<{ total: number; created: number; created_ids: number[]; skipped: Array<{ index: number; error: string }> }>('/api/link-sources/import', { rows }); invalidateData('/api/link-sources'); return result }
export const getLinkSourceReview = () => api.get<{ run: LinkSourceReviewRun | null; counts: Array<{ funnel_stage: LinkSourceFunnelStage; count: number }> }>('/api/link-sources/review')
export const importLinkSourceReview = async (body: Record<string, unknown>) => { const result = await api.post<{ planned: number; updated: number; skipped: number; run: LinkSourceReviewRun }>('/api/link-sources/review', body); invalidateData('/api/link-sources'); return result }
