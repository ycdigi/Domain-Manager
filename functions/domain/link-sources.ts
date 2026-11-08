import type { LinkOpportunityStatus, LinkSourceApprovalStatus, LinkSourceType, LinkSubmissionMode } from '../types'
import { linkOpportunityStatuses, linkSourceApprovalStatuses, linkSourceTypes, linkSubmissionModes, normalizeSourceUrl, normalizeTargetUrl, normalizeUrlTemplate } from '../../shared/link-sources'

export const sourceStatusValues = linkSourceApprovalStatuses as readonly LinkSourceApprovalStatus[]
export const sourceTypeValues = linkSourceTypes as readonly LinkSourceType[]
export const submissionModeValues = linkSubmissionModes as readonly LinkSubmissionMode[]
export const opportunityStatusValues = linkOpportunityStatuses as readonly LinkOpportunityStatus[]
export const opportunityStatusesRequiringApprovedSource = ['待处理', '已生成提交地址'] as const
export const opportunityStatusesWrittenByAttempt = ['请求已完成', '已提交待审核', '已确认公开链接', '被拒绝', '来源失效', '请求失败', '需要人工处理'] as const
export const attemptRequestStatuses = ['已完成', '失败', '需要人工'] as const
export const attemptResultStatuses = ['已提交待审核', '被拒绝', '来源失效'] as const

export const validateSourceInput = (data: Record<string, unknown>, partial = false) => {
    if (!partial || data.name !== undefined) {
        if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 200) return '来源名称必填且不能超过 200 个字符'
    }
    if (!partial || data.source_url !== undefined) {
        if (!normalizeSourceUrl(data.source_url)) return '来源 URL 必须是有效的 HTTP 或 HTTPS 地址'
    }
    if (data.source_type !== undefined && !sourceTypeValues.includes(data.source_type as LinkSourceType)) return '来源类型无效'
    if (data.submission_mode !== undefined && !submissionModeValues.includes(data.submission_mode as LinkSubmissionMode)) return '处理模式无效'
    if (data.approval_status !== undefined && !sourceStatusValues.includes(data.approval_status as LinkSourceApprovalStatus)) return '审核状态无效'
    if (data.enabled !== undefined && data.enabled !== 0 && data.enabled !== 1 && data.enabled !== false && data.enabled !== true) return '启用状态无效'
    if (data.country != null && (typeof data.country !== 'string' || data.country.length > 120)) return '国家字段不能超过 120 个字符'
    if (data.language != null && (typeof data.language !== 'string' || data.language.length > 120)) return '语言字段不能超过 120 个字符'
    if (data.topic_tags != null && (typeof data.topic_tags !== 'string' || data.topic_tags.length > 1000)) return '主题标签不能超过 1000 个字符'
    if (data.memo != null && (typeof data.memo !== 'string' || data.memo.length > 5000)) return '备注不能超过 5000 个字符'
    if (data.audit_flags != null && (typeof data.audit_flags !== 'string' || data.audit_flags.length > 2000)) return '审查标记不能超过 2000 个字符'
    if (data.url_template !== undefined) {
        const result = normalizeUrlTemplate(data.url_template)
        if (result.error) return result.error
    }
    return null
}

export const effectiveSourceEnabled = (approvalStatus: LinkSourceApprovalStatus, enabled: unknown) => {
    if (approvalStatus === '已批准') return enabled === undefined ? 1 : Number(Boolean(enabled))
    return 0
}

export const canQueueOpportunity = (approvalStatus: unknown, enabled: unknown) => approvalStatus === '已批准' && Number(enabled) === 1

export const validateOpportunityStatus = (status: unknown) => typeof status === 'string' && opportunityStatusValues.includes(status as LinkOpportunityStatus) ? null : '外链候选状态无效'

export const requiresApprovedSource = (status: unknown) => opportunityStatusesRequiringApprovedSource.includes(status as typeof opportunityStatusesRequiringApprovedSource[number])
export const isAttemptWrittenStatus = (status: unknown) => opportunityStatusesWrittenByAttempt.includes(status as typeof opportunityStatusesWrittenByAttempt[number])

export const opportunityStatusFromAttempt = (requestStatus: typeof attemptRequestStatuses[number], confirmed: number, resultStatus?: typeof attemptResultStatuses[number] | null): LinkOpportunityStatus => {
    if (confirmed) return '已确认公开链接'
    if (resultStatus) return resultStatus
    if (requestStatus === '失败') return '请求失败'
    if (requestStatus === '需要人工') return '需要人工处理'
    return '请求已完成'
}

export const normalizeOpportunityUrl = (value: unknown) => normalizeTargetUrl(value)
