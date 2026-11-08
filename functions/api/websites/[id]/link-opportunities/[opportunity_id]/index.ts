import type { Env, WebsiteLinkOpportunity } from '../../../../../types'
import { checkAuth } from '../../../../../utils/auth'
import { canQueueOpportunity, isAttemptWrittenStatus, requiresApprovedSource, validateOpportunityStatus } from '../../../../../domain/link-sources'
import { generateSubmissionUrl, normalizeTargetUrl } from '../../../../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const textField = (value: unknown, max: number) => value == null || value === '' ? null : typeof value === 'string' && value.length <= max ? value.trim() : undefined
export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id); const opportunityId = Number(context.params.opportunity_id)
        const body = await context.request.json() as Record<string, unknown>
        const allowed = new Set(['target_url', 'status', 'title', 'description', 'anchor_text', 'next_run_at', 'memo'])
        if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.has(key))) return json(null, 400, '外链候选更新包含不支持的字段')
        const current = await context.env.DB.prepare(`SELECT o.*, s.approval_status, s.enabled AS source_enabled, s.url_template FROM website_link_opportunities o JOIN link_sources s ON s.id=o.source_id WHERE o.id=? AND o.website_id=?`).bind(opportunityId, websiteId).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '网站外链候选不存在')
        const merged = { ...current, ...body }
        const targetUrl = body.target_url === undefined ? current.target_url : normalizeTargetUrl(body.target_url)
        if (!targetUrl) return json(null, 400, '目标 URL 必须是有效的 HTTP 或 HTTPS 地址')
        const status = String(merged.status)
        const statusError = validateOpportunityStatus(status); if (statusError) return json(null, 400, statusError)
        if (status === '已确认公开链接') return json(null, 400, '公开链接结论必须通过带证据的人工尝试记录')
        if (isAttemptWrittenStatus(status)) return json(null, 400, '请求结果必须通过人工尝试记录')
        if (requiresApprovedSource(status) && !canQueueOpportunity(current.approval_status, current.source_enabled)) return json(null, 400, '来源必须已批准并启用后才能进入处理流程')
        let submissionUrl = current.submission_url
        if (status === '已生成提交地址') {
            submissionUrl = generateSubmissionUrl(current.url_template, targetUrl)
            if (!submissionUrl) return json(null, 400, '已审核来源没有可用模板，无法生成提交地址')
        } else if (body.target_url !== undefined && current.submission_url) {
            if (!canQueueOpportunity(current.approval_status, current.source_enabled)) return json(null, 400, '来源不可用时不能修改目标 URL')
            submissionUrl = generateSubmissionUrl(current.url_template, targetUrl)
        }
        const fields = {
            target_url: targetUrl, status, submission_url: submissionUrl,
            title: body.title === undefined ? current.title : textField(body.title, 300),
            description: body.description === undefined ? current.description : textField(body.description, 5000),
            anchor_text: body.anchor_text === undefined ? current.anchor_text : textField(body.anchor_text, 300),
            next_run_at: body.next_run_at === undefined ? current.next_run_at : textField(body.next_run_at, 50),
            memo: body.memo === undefined ? current.memo : textField(body.memo, 5000),
        }
        if (Object.values(fields).some(value => value === undefined)) return json(null, 400, '外链候选字段格式无效')
        const result = await context.env.DB.prepare(`UPDATE website_link_opportunities SET target_url=?,status=?,submission_url=?,title=?,description=?,anchor_text=?,next_run_at=?,memo=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND website_id=? RETURNING *`).bind(fields.target_url, fields.status, fields.submission_url, fields.title, fields.description, fields.anchor_text, fields.next_run_at, fields.memo, opportunityId, websiteId).run<WebsiteLinkOpportunity>()
        return json(result.results?.[0] || null, 200, '网站外链候选已更新')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '网站外链候选更新失败') }
}
