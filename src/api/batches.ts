import { api } from '../utils/request'
import { cachedGet, cachedValue, invalidateData } from '../utils/workspaceCache'

export type BatchStatus = '进行中' | '待复盘' | '已复盘' | '已归档'
export type OperatingScenario = 'Astro 内容站' | 'WordPress 计算器站' | 'WordPress 资讯站' | '通用网站' | string
export interface Batch { id: number; name: string; source?: string | null; goal?: string | null; hypothesis?: string | null; status: BatchStatus; review_conclusion?: string | null; next_action?: string | null; review_requested_at?: string | null; reviewed_at?: string | null; archived_at?: string | null; created_at: string; updated_at: string; member_count?: number; review_count?: number }
export interface BatchMember { membership_id: number; batch_id: number; website_id: number; joined_at: string; member_note?: string | null; membership_status: 'active' | 'removed'; removed_at?: string | null; removed_reason?: string | null; name: string; stage: string; lifecycle: string; platform: string; operating_scenario?: OperatingScenario | null; scenario_note?: string | null; page_count?: number | null; article_count?: number | null; calculator_count?: number | null; wp_article_count?: number | null; wp_calculator_count?: number | null; content_stats_updated_date?: string | null }
export interface BatchReview { id: number; batch_id: number; reviewed_at: string; member_count: number; scenario_counts: Record<string, number>; stage_counts: Record<string, number>; content_totals: { page_count: number; article_count?: number; calculator_count?: number; wp_article_count?: number; wp_calculator_count?: number }; conclusion?: string | null; next_action?: string | null }
export interface BatchDetail extends Batch { members: BatchMember[]; latest_review: BatchReview | null; review_changed: boolean }
export interface WorkQueueItem { type: 'monitor' | 'next_action' | 'task' | 'batch'; website_id?: number; batch_id?: number; task_id?: number; title: string; detail?: string | null; due_date?: string | null }
export interface WorkQueue { counts: { monitor: number; next_action: number; task: number; batch: number; total: number }; items: WorkQueueItem[] }

export const batches = cachedValue<Batch[]>('/api/batches')
export const getBatches = (force = false) => cachedGet<Batch[]>('/api/batches', force)
export const getBatch = (id: number, force = false) => cachedGet<BatchDetail>(`/api/batches/${id}`, force)
export const getBatchMembers = (id: number, force = false) => cachedGet<BatchMember[]>(`/api/batches/${id}/members`, force)
export const createBatch = async (body: Record<string, unknown>) => { const result = await api.post<Batch>('/api/batches', body); invalidateData('/api/batches'); return result }
export const updateBatch = async (id: number, body: Record<string, unknown>) => { const result = await api.patch<Batch>(`/api/batches/${id}`, body); invalidateData('/api/batches', `/api/batches/${id}`, '/api/work-queue'); return result }
export const deleteBatch = async (id: number) => { const result = await api.delete(`/api/batches/${id}`); invalidateData('/api/batches', `/api/batches/${id}`); return result }
export const addBatchMembers = async (id: number, websiteIds: number[], note?: string) => { const result = await api.post<BatchMember[]>(`/api/batches/${id}/members`, { website_ids: websiteIds, note }); invalidateData('/api/batches', `/api/batches/${id}`, `/api/batches/${id}/members`); return result }
export interface BatchAssignmentPayload { websiteIds: number[]; batchId?: number; batch?: { name: string }; memberNote?: string; websiteFields?: Record<string, unknown> }
export interface BatchAssignmentResult { batch: BatchDetail; batch_id: number; website_ids: number[]; accepted: number; skipped: number; reactivated: number }
export const assignBatch = async (payload: BatchAssignmentPayload) => { const result = await api.post<BatchAssignmentResult>('/api/batches/assign', { website_ids: payload.websiteIds, batch_id: payload.batchId, batch: payload.batch, member_note: payload.memberNote, website_fields: payload.websiteFields }); invalidateData('/api/batches', '/api/websites', payload.batchId ? `/api/batches/${payload.batchId}` : '/api/work-queue'); return result }
export const removeBatchMembers = async (id: number, websiteIds: number[], reason?: string) => { const result = await api.delete<BatchMember[]>(`/api/batches/${id}/members`, { body: { website_ids: websiteIds, reason } }); invalidateData('/api/batches', `/api/batches/${id}`, `/api/batches/${id}/members`); return result }
export const requestBatchReview = async (id: number) => { const result = await api.post<Batch>(`/api/batches/${id}/reviews`, { action: 'request' }); invalidateData('/api/batches', `/api/batches/${id}`, '/api/work-queue'); return result }
export const completeBatchReview = async (id: number, body: { conclusion?: string; next_action?: string }) => { const result = await api.post<{ snapshot: BatchReview }>(`/api/batches/${id}/reviews`, { action: 'complete', ...body }); invalidateData('/api/batches', `/api/batches/${id}`, `/api/batches/${id}/reviews`, '/api/work-queue'); return result }
export const getWorkQueue = (force = false) => cachedGet<WorkQueue>('/api/work-queue', force)
export const workQueue = cachedValue<WorkQueue>('/api/work-queue')
