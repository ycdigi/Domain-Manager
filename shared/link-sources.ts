export const linkSourceTypes = ['搜索页', 'SEO 查询页', '工具目录', '行业资源页', '社区页面', '可能的提交页', '无法判断'] as const
export const linkSubmissionModes = ['人工提交', '允许自动处理', '仅观察'] as const
export const linkSourceApprovalStatuses = ['待审核', '已批准', '已暂停', '已拒绝', '已失效'] as const
export const linkOpportunityStatuses = ['待审核', '待处理', '已生成提交地址', '请求已完成', '已提交待审核', '已确认公开链接', '被拒绝', '来源失效', '请求失败', '需要人工处理', '已暂停'] as const
export const linkSourceFunnelStages = ['未检查', '待筛选', '建议保留', '已保留', '待删除', '已排除'] as const
export const linkSourceCheckStatuses = ['未检查', '可访问', '重定向', '404', '受阻', '超时', '错误', '需要人工验证'] as const

export type LinkSourceType = typeof linkSourceTypes[number]
export type LinkSubmissionMode = typeof linkSubmissionModes[number]
export type LinkSourceApprovalStatus = typeof linkSourceApprovalStatuses[number]
export type LinkOpportunityStatus = typeof linkOpportunityStatuses[number]
export type LinkSourceFunnelStage = typeof linkSourceFunnelStages[number]
export type LinkSourceCheckStatus = typeof linkSourceCheckStatuses[number]

export const funnelStageFromCheckStatus = (status: LinkSourceCheckStatus): LinkSourceFunnelStage => status === '可访问' || status === '重定向' ? '建议保留' : status === '未检查' ? '未检查' : '待删除'

const decodeHtmlEntities = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
const normalizeProtocol = (value: string) => /^https?:\/\//i.test(value) ? value : `https://${value}`

export const normalizeTargetUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null
    const candidate = normalizeProtocol(value.trim())
    try {
        const url = new URL(candidate)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null
        url.hash = ''
        return url.toString().replace(/\/$/, '')
    } catch { return null }
}

export const normalizeSourceUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
        const url = new URL(normalizeProtocol(value.trim()))
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null
        url.hash = ''
        return url.toString().replace(/\/$/, '')
    } catch { return null }
}

export const normalizeUrlTemplate = (value: unknown): { template: string | null; flags: string[]; error?: string } => {
    if (value == null || value === '') return { template: null, flags: [] }
    if (typeof value !== 'string' || !value.trim()) return { template: null, flags: [], error: 'URL 模板格式无效' }
    let template = decodeHtmlEntities(value.trim()).replace(/\*\*\*/g, '{{target_url}}').replace(/,+$/, '')
    const flags: string[] = []
    if (template !== value.trim()) flags.push('已清理尾部标点或 HTML 编码')
    if (!template.includes('{{target_url}}')) return { template, flags: [...flags, '缺少 {{target_url}} 占位符'], error: 'URL 模板必须包含 {{target_url}} 占位符' }
    if ((template.match(/\{\{target_url\}\}/g) || []).length !== 1) return { template, flags: [...flags, '占位符数量异常'], error: 'URL 模板只能包含一个 {{target_url}} 占位符' }
    const hostPart = template.match(/^https?:\/\/([^/?#]+)/i)?.[1] || ''
    if (hostPart.includes('{{target_url}}')) return { template, flags: [...flags, '占位符位于主机名'], error: 'URL 模板不能把占位符放在主机名中' }
    try {
        const parsed = new URL(template.replace('{{target_url}}', 'https%3A%2F%2Fexample.com'))
        if (!['http:', 'https:'].includes(parsed.protocol)) return { template, flags, error: 'URL 模板必须使用 HTTP 或 HTTPS' }
    } catch { return { template, flags, error: 'URL 模板格式无效' }
    }
    return { template, flags }
}

export const generateSubmissionUrl = (template: unknown, target: unknown): string | null => {
    const normalizedTarget = normalizeTargetUrl(target)
    const checked = normalizeUrlTemplate(template)
    if (!normalizedTarget || checked.error || !checked.template) return null
    try {
        const marker = 'TARGET_URL_PLACEHOLDER'
        const url = new URL(checked.template.replace('{{target_url}}', marker))
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
        return url.href.replace(marker, encodeURIComponent(normalizedTarget))
    } catch { return null }
}

export const sourceUrlFromTemplate = (template: string | null, fallback: unknown): string | null => {
    const candidate = template ? template.replace('{{target_url}}', 'https%3A%2F%2Fexample.com') : fallback
    if (typeof candidate !== 'string' || !candidate.trim()) return null
    try {
        const url = new URL(normalizeProtocol(candidate.trim()))
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null
        return url.origin
    } catch { return null }
}

export const normalizeAuditSource = (value: unknown) => {
    const raw = typeof value === 'string' ? value.trim() : ''
    const flags: string[] = []
    if (!raw) return { sourceUrl: null, template: null, flags: ['空行'], error: '来源地址为空' }
    if (raw.includes('&amp;')) flags.push('包含 HTML 编码')
    if (/[\s,]$/.test(raw)) flags.push('包含尾部标点')
    const templateResult = normalizeUrlTemplate(raw.replace(/\*\*\*/g, '{{target_url}}'))
    flags.push(...templateResult.flags)
    const sourceUrl = sourceUrlFromTemplate(templateResult.template, raw)
    if (!sourceUrl) flags.push('URL 无效')
    return { sourceUrl, template: templateResult.template, flags, error: templateResult.error }
}
