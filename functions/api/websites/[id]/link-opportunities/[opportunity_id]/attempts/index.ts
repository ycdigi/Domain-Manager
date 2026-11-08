import type { Env, LinkAttempt } from '../../../../../../types'
import { checkAuth } from '../../../../../../utils/auth'
import { attemptRequestStatuses, attemptResultStatuses, canQueueOpportunity, opportunityStatusFromAttempt } from '../../../../../../domain/link-sources'
import { normalizeSourceUrl } from '../../../../../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const methods = ['人工'] as const
const textField = (value: unknown, max: number) => value == null || value === '' ? null : typeof value === 'string' && value.trim().length <= max ? value.trim() : undefined

const getOpportunity = async (context: { env: Env; params: Record<string, string | string[]> }) => context.env.DB.prepare(`
    SELECT o.*, s.approval_status, s.enabled AS source_enabled
    FROM website_link_opportunities o
    JOIN link_sources s ON s.id=o.source_id
    WHERE o.id=? AND o.website_id=?
`).bind(Number(context.params.opportunity_id), Number(context.params.id)).first<Record<string, unknown>>()

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const opportunity = await getOpportunity(context)
        if (!opportunity) return json(null, 404, '网站外链候选不存在')
        const result = await context.env.DB.prepare('SELECT * FROM link_attempts WHERE opportunity_id=? ORDER BY id DESC').bind(Number(context.params.opportunity_id)).all<LinkAttempt>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取外链尝试记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const opportunity = await getOpportunity(context)
        if (!opportunity) return json(null, 404, '网站外链候选不存在')
        const body = await context.request.json() as Record<string, unknown>
        const method = body.method == null ? '人工' : body.method
        const requestStatus = body.request_status
        const resultStatus = body.result_status == null || body.result_status === '' ? null : body.result_status
        if (!methods.includes(method as typeof methods[number])) return json(null, 400, '处理方式无效')
        if (!attemptRequestStatuses.includes(requestStatus as typeof attemptRequestStatuses[number])) return json(null, 400, '请求状态无效')
        if (resultStatus !== null && !attemptResultStatuses.includes(resultStatus as typeof attemptResultStatuses[number])) return json(null, 400, '处理结论无效')
        if (resultStatus && (method !== '人工' || requestStatus !== '已完成')) return json(null, 400, '已提交、拒绝或来源失效结论必须记录为人工已完成')
        const httpStatus = body.http_status == null || body.http_status === '' ? null : Number(body.http_status)
        if (httpStatus != null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) return json(null, 400, 'HTTP 状态码无效')
        const confirmed = body.confirmed_public_link === true || body.confirmed_public_link === 1 ? 1 : body.confirmed_public_link === false || body.confirmed_public_link === 0 || body.confirmed_public_link == null ? 0 : null
        if (confirmed == null) return json(null, 400, '公开链接确认值无效')
        if (confirmed && resultStatus) return json(null, 400, '公开链接确认不能同时记录其他目录结论')
        const responseSummary = textField(body.response_summary, 5000)
        const errorMessage = textField(body.error_message, 5000)
        if (responseSummary === undefined || errorMessage === undefined) return json(null, 400, '响应摘要或错误信息无效')
        const evidenceUrl = body.evidence_url == null || body.evidence_url === '' ? null : normalizeSourceUrl(body.evidence_url)
        if (body.evidence_url != null && body.evidence_url !== '' && !evidenceUrl) return json(null, 400, '证据 URL 必须是有效的 HTTP 或 HTTPS 地址')
        if (confirmed && requestStatus !== '已完成') return json(null, 400, '只有已完成的尝试才能确认公开链接')
        if (confirmed && !evidenceUrl) return json(null, 400, '确认公开链接必须提供证据 URL')
        if (confirmed && !canQueueOpportunity(opportunity.approval_status, opportunity.source_enabled)) return json(null, 400, '确认公开链接前，来源必须已批准并启用')
        const attemptedAt = body.attempted_at == null || body.attempted_at === '' ? null : textField(body.attempted_at, 50)
        if (attemptedAt === undefined) return json(null, 400, '尝试时间无效')
        const status = opportunityStatusFromAttempt(requestStatus as typeof attemptRequestStatuses[number], confirmed, resultStatus as typeof attemptResultStatuses[number] | null)
        const insert = context.env.DB.prepare(`INSERT INTO link_attempts (opportunity_id,attempted_at,method,request_status,result_status,http_status,confirmed_public_link,error_message,response_summary,evidence_url) VALUES (?,COALESCE(?,CURRENT_TIMESTAMP),?,?,?,?,?,?,?,?) RETURNING *`).bind(Number(context.params.opportunity_id), attemptedAt, method, requestStatus, resultStatus, httpStatus, confirmed, errorMessage, responseSummary, evidenceUrl)
        const update = context.env.DB.prepare('UPDATE website_link_opportunities SET status=?,last_attempt_at=COALESCE(?,CURRENT_TIMESTAMP),evidence_url=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND website_id=?').bind(status, attemptedAt, evidenceUrl, errorMessage, Number(context.params.opportunity_id), Number(context.params.id))
        const statements = [insert, update]
        if (resultStatus === '来源失效') {
            statements.push(context.env.DB.prepare("UPDATE link_sources SET approval_status='已失效',enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(opportunity.source_id))
            statements.push(context.env.DB.prepare("UPDATE website_link_opportunities SET status='已暂停',updated_at=CURRENT_TIMESTAMP WHERE source_id=? AND id<>? AND status IN ('待处理','已生成提交地址')").bind(opportunity.source_id, Number(context.params.opportunity_id)))
        }
        const results = await context.env.DB.batch(statements)
        return json(results[0].results?.[0] || null, 201, '外链尝试已记录')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '外链尝试记录失败') }
}
