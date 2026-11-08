import type { Env, LinkSourceCheckStatus, LinkSourceReviewRun } from '../../../types'
import { checkSessionOrApiToken } from '../../../utils/auth'
import { funnelStageFromCheckStatus, linkSourceCheckStatuses, normalizeSourceUrl } from '../../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const runStatuses = ['未运行', '运行中', '已完成', '部分完成', '失败'] as const
const text = (value: unknown, max: number) => value == null || value === '' ? null : typeof value === 'string' && value.trim().length <= max ? value.trim() : undefined
const integer = (value: unknown, fallback = 0) => value == null || value === '' ? fallback : Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkSessionOrApiToken(context); if (authError) return authError
    try {
        const [run, counts] = await Promise.all([
            context.env.DB.prepare('SELECT * FROM link_source_review_runs WHERE id=1').first<LinkSourceReviewRun>(),
            context.env.DB.prepare("SELECT COALESCE(funnel_stage, '未检查') AS funnel_stage, COUNT(*) AS count FROM link_sources s LEFT JOIN link_source_reviews r ON r.source_id=s.id GROUP BY COALESCE(funnel_stage, '未检查') ORDER BY funnel_stage").all<{ funnel_stage: string; count: number }>()
        ])
        return json({ run: run || null, counts: counts.results || [] })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取来源审查汇总失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkSessionOrApiToken(context); if (authError) return authError
    try {
        const body = await context.request.json() as { run?: Record<string, unknown>; results?: Array<Record<string, unknown>> }
        if (!Array.isArray(body.results) || body.results.length > 5000) return json(null, 400, 'results 必须是最多 5000 项的数组')
        const run = body.run || {}
        const plannedCount = integer(run.planned_count)
        const completedCount = integer(run.completed_count)
        const failedCount = integer(run.failed_count)
        const status = run.status == null ? '已完成' : String(run.status)
        if (plannedCount == null || completedCount == null || failedCount == null || !runStatuses.includes(status as typeof runStatuses[number])) return json(null, 400, '运行汇总格式无效')
        const errors: Array<{ index: number; error: string }> = []
        const updates: Array<{ sourceId: number; checkStatus: LinkSourceCheckStatus; httpStatus: number | null; checkedUrl: string | null; errorMessage: string | null; checkedAt: string | null }> = []
        for (let index = 0; index < body.results.length; index += 1) {
            const row = body.results[index] || {}
            const sourceId = Number(row.source_id)
            const checkStatus = String(row.check_status || '') as LinkSourceCheckStatus
            const httpStatus = row.http_status == null || row.http_status === '' ? null : integer(row.http_status)
            const checkedUrl = row.checked_url == null || row.checked_url === '' ? null : normalizeSourceUrl(row.checked_url)
            const errorMessage = text(row.error_message, 5000)
            const checkedAt = text(row.checked_at, 50)
            if (!Number.isInteger(sourceId) || sourceId < 1) { errors.push({ index, error: 'source_id 无效' }); continue }
            if (!await context.env.DB.prepare('SELECT id FROM link_sources WHERE id=?').bind(sourceId).first()) { errors.push({ index, error: '来源不存在' }); continue }
            if (!linkSourceCheckStatuses.includes(checkStatus)) { errors.push({ index, error: '检查状态无效' }); continue }
            if (httpStatus == null && row.http_status != null && row.http_status !== '') { errors.push({ index, error: 'HTTP 状态码无效' }); continue }
            if (checkedUrl == null && row.checked_url != null && row.checked_url !== '') { errors.push({ index, error: '检查 URL 无效' }); continue }
            if (errorMessage === undefined || checkedAt === undefined) { errors.push({ index, error: '检查说明或时间格式无效' }); continue }
            updates.push({ sourceId, checkStatus, httpStatus, checkedUrl, errorMessage, checkedAt })
        }
        if (errors.length) return json({ updated: 0, errors }, 400, '轮询结果校验失败')
        const statements: D1PreparedStatement[] = updates.map(item => context.env.DB.prepare(`INSERT INTO link_source_reviews (source_id,funnel_stage,check_status,http_status,checked_url,error_message,checked_at,updated_at) VALUES (?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP) ON CONFLICT(source_id) DO UPDATE SET funnel_stage=excluded.funnel_stage,check_status=excluded.check_status,http_status=excluded.http_status,checked_url=excluded.checked_url,error_message=excluded.error_message,checked_at=excluded.checked_at,updated_at=CURRENT_TIMESTAMP`).bind(item.sourceId, funnelStageFromCheckStatus(item.checkStatus), item.checkStatus, item.httpStatus, item.checkedUrl, item.errorMessage, item.checkedAt))
        statements.push(context.env.DB.prepare(`INSERT INTO link_source_review_runs (id,planned_count,completed_count,failed_count,status,started_at,completed_at,updated_at) VALUES (1,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET planned_count=excluded.planned_count,completed_count=excluded.completed_count,failed_count=excluded.failed_count,status=excluded.status,started_at=excluded.started_at,completed_at=excluded.completed_at,updated_at=CURRENT_TIMESTAMP`).bind(plannedCount, completedCount, failedCount, status, text(run.started_at, 50), text(run.completed_at, 50)))
        await context.env.DB.batch(statements)
        return json({ planned: plannedCount, updated: updates.length, skipped: 0, run: { planned_count: plannedCount, completed_count: completedCount, failed_count: failedCount, status } }, 200, '来源轮询结果已更新')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '来源轮询结果写入失败') }
}
