import type { Env, WebsiteLinkOpportunity } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { canQueueOpportunity, isAttemptWrittenStatus, requiresApprovedSource, validateOpportunityStatus } from '../../../../domain/link-sources'
import { generateSubmissionUrl, normalizeSourceUrl, normalizeTargetUrl } from '../../../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const textField = (value: unknown, max: number) => value == null || value === '' ? null : typeof value === 'string' && value.length <= max ? value.trim() : undefined
const validHttpUrl = (value: unknown) => normalizeSourceUrl(value)

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id)
        const website = await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first()
        if (!website) return json(null, 404, '网站不存在')
        const result = await context.env.DB.prepare(`SELECT o.*, s.name AS source_name, s.source_url, s.url_template, s.source_type, s.country, s.language, s.submission_mode, s.approval_status, s.enabled AS source_enabled FROM website_link_opportunities o JOIN link_sources s ON s.id=o.source_id WHERE o.website_id=? ORDER BY COALESCE(o.next_run_at, '9999-12-31'), o.updated_at DESC, o.id DESC`).bind(websiteId).all<WebsiteLinkOpportunity & Record<string, unknown>>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取网站外链候选失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id)
        const data = await context.request.json() as Record<string, unknown>
        const allowed = new Set(['source_id', 'target_url', 'status', 'submission_url', 'title', 'description', 'anchor_text', 'next_run_at', 'memo'])
        if (Object.keys(data).some(key => !allowed.has(key))) return json(null, 400, '外链候选包含不支持的字段')
        if (!Number.isInteger(websiteId) || websiteId < 1) return json(null, 400, '网站编号无效')
        if (!await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first()) return json(null, 404, '网站不存在')
        const sourceId = Number(data.source_id)
        const source = await context.env.DB.prepare('SELECT * FROM link_sources WHERE id=?').bind(sourceId).first<Record<string, unknown>>()
        if (!Number.isInteger(sourceId) || !source) return json(null, 400, '外链来源不存在')
        const targetUrl = normalizeTargetUrl(data.target_url)
        if (!targetUrl) return json(null, 400, '目标 URL 必须是有效的 HTTP 或 HTTPS 地址')
        const status = data.status == null ? (canQueueOpportunity(source.approval_status, source.enabled) ? '待处理' : '待审核') : String(data.status)
        const statusError = validateOpportunityStatus(status); if (statusError) return json(null, 400, statusError)
        if (status === '已确认公开链接') return json(null, 400, '公开链接结论必须通过带证据的人工尝试记录')
        if (isAttemptWrittenStatus(status)) return json(null, 400, '请求结果必须通过人工尝试记录')
        if (requiresApprovedSource(status) && !canQueueOpportunity(source.approval_status, source.enabled)) return json(null, 400, '来源必须已批准并启用后才能进入处理流程')
        const submissionUrl = status === '已生成提交地址' ? generateSubmissionUrl(source.url_template, targetUrl) : null
        const suppliedSubmissionUrl = data.submission_url == null || data.submission_url === '' ? null : validHttpUrl(data.submission_url)
        if (data.submission_url != null && !submissionUrl) return json(null, 400, '提交 URL 必须是有效的 HTTP 或 HTTPS 地址')
        if (data.submission_url != null && suppliedSubmissionUrl !== normalizeSourceUrl(submissionUrl)) return json(null, 400, '提交 URL 必须由已审核来源模板生成')
        if (status === '已生成提交地址' && !submissionUrl) return json(null, 400, '已审核来源没有可用模板，无法生成提交地址')
        const fields = { title: textField(data.title, 300), description: textField(data.description, 5000), anchor_text: textField(data.anchor_text, 300), next_run_at: textField(data.next_run_at, 50), memo: textField(data.memo, 5000) }
        if (fields.title === undefined || fields.description === undefined || fields.anchor_text === undefined || fields.next_run_at === undefined || fields.memo === undefined) return json(null, 400, '外链候选字段格式无效')
        const result = await context.env.DB.prepare(`INSERT INTO website_link_opportunities (website_id,source_id,target_url,status,submission_url,title,description,anchor_text,next_run_at,memo) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(websiteId, sourceId, targetUrl, status, submissionUrl, fields.title, fields.description, fields.anchor_text, fields.next_run_at, fields.memo).run<WebsiteLinkOpportunity>()
        return json(result.results?.[0] || null, 201, '网站外链候选已创建')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '网站外链候选创建失败') }
}
