import type { Env, WebsiteLinkOpportunity } from '../../../../../types'
import { checkAuth } from '../../../../../utils/auth'
import { canQueueOpportunity, validateOpportunityStatus } from '../../../../../domain/link-sources'
import { normalizeSourceUrl, normalizeTargetUrl } from '../../../../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const textField = (value: unknown, max: number) => value == null || value === '' ? null : typeof value === 'string' && value.length <= max ? value.trim() : undefined
const urlField = (value: unknown) => value == null || value === '' ? null : normalizeSourceUrl(value)

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const websiteId = Number(context.params.id); const opportunityId = Number(context.params.opportunity_id)
        const body = await context.request.json() as Record<string, unknown>
        const allowed = new Set(['target_url', 'status', 'submission_url', 'title', 'description', 'anchor_text', 'next_run_at', 'evidence_url', 'memo', 'last_error'])
        if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.has(key))) return json(null, 400, '外链候选更新包含不支持的字段')
        const current = await context.env.DB.prepare(`SELECT o.*, s.approval_status, s.enabled AS source_enabled FROM website_link_opportunities o JOIN link_sources s ON s.id=o.source_id WHERE o.id=? AND o.website_id=?`).bind(opportunityId, websiteId).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '网站外链候选不存在')
        const merged = { ...current, ...body }
        const targetUrl = body.target_url === undefined ? current.target_url : normalizeTargetUrl(body.target_url)
        if (!targetUrl) return json(null, 400, '目标 URL 必须是有效的 HTTP 或 HTTPS 地址')
        const status = String(merged.status)
        const statusError = validateOpportunityStatus(status); if (statusError) return json(null, 400, statusError)
        if (status === '待处理' && !canQueueOpportunity(current.approval_status, current.source_enabled)) return json(null, 400, '来源必须已批准并启用后才能进入待处理')
        const submissionUrl = body.submission_url === undefined ? current.submission_url : urlField(body.submission_url)
        const evidenceUrl = body.evidence_url === undefined ? current.evidence_url : urlField(body.evidence_url)
        if (body.submission_url !== undefined && body.submission_url != null && body.submission_url !== '' && !submissionUrl) return json(null, 400, '提交 URL 必须是有效的 HTTP 或 HTTPS 地址')
        if (body.evidence_url !== undefined && body.evidence_url != null && body.evidence_url !== '' && !evidenceUrl) return json(null, 400, '证据 URL 必须是有效的 HTTP 或 HTTPS 地址')
        const fields = {
            target_url: targetUrl, status, submission_url: submissionUrl,
            title: body.title === undefined ? current.title : textField(body.title, 300),
            description: body.description === undefined ? current.description : textField(body.description, 5000),
            anchor_text: body.anchor_text === undefined ? current.anchor_text : textField(body.anchor_text, 300),
            next_run_at: body.next_run_at === undefined ? current.next_run_at : textField(body.next_run_at, 50),
            evidence_url: evidenceUrl,
            memo: body.memo === undefined ? current.memo : textField(body.memo, 5000),
            last_error: body.last_error === undefined ? current.last_error : textField(body.last_error, 5000)
        }
        if (Object.values(fields).some(value => value === undefined)) return json(null, 400, '外链候选字段格式无效')
        const result = await context.env.DB.prepare(`UPDATE website_link_opportunities SET target_url=?,status=?,submission_url=?,title=?,description=?,anchor_text=?,next_run_at=?,evidence_url=?,memo=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND website_id=? RETURNING *`).bind(fields.target_url, fields.status, fields.submission_url, fields.title, fields.description, fields.anchor_text, fields.next_run_at, fields.evidence_url, fields.memo, fields.last_error, opportunityId, websiteId).run<WebsiteLinkOpportunity>()
        return json(result.results?.[0] || null, 200, '网站外链候选已更新')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '网站外链候选更新失败') }
}
