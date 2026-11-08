import type { Env, LinkSource } from '../../types'
import { checkAuth, checkSessionOrApiToken } from '../../utils/auth'
import { effectiveSourceEnabled, validateSourceInput } from '../../domain/link-sources'
import { normalizeSourceUrl, normalizeUrlTemplate } from '../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

const sourcePayload = (data: Record<string, unknown>, current?: Record<string, unknown>) => {
    const merged = { ...(current || {}), ...data }
    const sourceUrl = normalizeSourceUrl(merged.source_url)
    const template = merged.url_template == null || merged.url_template === '' ? null : normalizeUrlTemplate(merged.url_template).template
    return {
        name: String(merged.name || '').trim(), source_url: sourceUrl, source_type: merged.source_type || '无法判断',
        country: merged.country ? String(merged.country).trim() : null, language: merged.language ? String(merged.language).trim() : null,
        topic_tags: merged.topic_tags ? String(merged.topic_tags).trim() : null, url_template: template,
        submission_mode: merged.submission_mode || '仅观察', approval_status: merged.approval_status || '待审核',
        enabled: effectiveSourceEnabled(merged.approval_status as never, merged.enabled),
        audit_flags: merged.audit_flags ? String(merged.audit_flags).trim() : null, last_checked_at: merged.last_checked_at || null,
        memo: merged.memo ? String(merged.memo).trim() : null
    }
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkSessionOrApiToken(context); if (authError) return authError
    try {
        const params = new URL(context.request.url).searchParams
        const values: string[] = []; const where: string[] = []
        if (params.get('approval_status')) { where.push('s.approval_status=?'); values.push(params.get('approval_status')!) }
        if (params.get('source_type')) { where.push('s.source_type=?'); values.push(params.get('source_type')!) }
        if (params.get('enabled') !== null) { where.push('s.enabled=?'); values.push(params.get('enabled') === '1' ? '1' : '0') }
        if (params.get('funnel_stage')) { where.push("COALESCE(r.funnel_stage, '未检查')=?"); values.push(params.get('funnel_stage')!) }
        if (params.get('check_status')) { where.push("COALESCE(r.check_status, '未检查')=?"); values.push(params.get('check_status')!) }
        const result = await context.env.DB.prepare(`SELECT s.*, COUNT(o.id) AS opportunity_count, COALESCE(r.funnel_stage, '未检查') AS funnel_stage, COALESCE(r.check_status, '未检查') AS check_status, r.http_status, r.checked_url, r.error_message AS check_error_message, r.checked_at FROM link_sources s LEFT JOIN link_source_reviews r ON r.source_id=s.id LEFT JOIN website_link_opportunities o ON o.source_id=s.id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY s.id, r.source_id ORDER BY CASE COALESCE(r.funnel_stage, '未检查') WHEN '建议保留' THEN 1 WHEN '待筛选' THEN 2 WHEN '未检查' THEN 3 WHEN '待删除' THEN 4 WHEN '已保留' THEN 5 WHEN '已排除' THEN 6 ELSE 7 END, s.approval_status, s.source_type, s.name COLLATE NOCASE`).bind(...values).all<LinkSource>()
        return json(result.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取外链来源失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const data = await context.request.json() as Record<string, unknown>
        const validation = validateSourceInput({ ...data, approval_status: data.approval_status || '待审核', submission_mode: data.submission_mode || '仅观察', source_type: data.source_type || '无法判断' })
        if (validation) return json(null, 400, validation)
        const payload = sourcePayload(data)
        if (!payload.source_url) return json(null, 400, '来源 URL 必须是有效的 HTTP 或 HTTPS 地址')
        const result = await context.env.DB.prepare(`INSERT INTO link_sources (name,source_url,source_type,country,language,topic_tags,url_template,submission_mode,approval_status,enabled,audit_flags,last_checked_at,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(payload.name, payload.source_url, payload.source_type, payload.country, payload.language, payload.topic_tags, payload.url_template, payload.submission_mode, payload.approval_status, payload.enabled, payload.audit_flags, payload.last_checked_at, payload.memo).run<LinkSource>()
        return json(result.results?.[0] || null, 201, '外链来源已创建')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '外链来源创建失败') }
}
