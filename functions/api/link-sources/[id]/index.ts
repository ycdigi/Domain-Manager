import type { Env, LinkSource } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { effectiveSourceEnabled, validateSourceInput } from '../../../domain/link-sources'
import { normalizeSourceUrl, normalizeUrlTemplate } from '../../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const allowed = new Set(['name', 'source_url', 'source_type', 'country', 'language', 'topic_tags', 'url_template', 'submission_mode', 'approval_status', 'enabled', 'audit_flags', 'last_checked_at', 'memo'])

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as Record<string, unknown>
        if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.has(key))) return json(null, 400, '外链来源更新包含不支持的字段')
        const id = Number(context.params.id)
        const current = await context.env.DB.prepare('SELECT * FROM link_sources WHERE id=?').bind(id).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '外链来源不存在')
        const merged = { ...current, ...body }
        const validation = validateSourceInput(merged)
        if (validation) return json(null, 400, validation)
        const sourceUrl = normalizeSourceUrl(merged.source_url)
        const template = merged.url_template == null || merged.url_template === '' ? null : normalizeUrlTemplate(merged.url_template).template
        const approvalStatus = String(merged.approval_status)
        const requestedEnabled = body.enabled !== undefined ? body.enabled : current.approval_status === approvalStatus ? current.enabled : undefined
        const values = [String(merged.name).trim(), sourceUrl, merged.source_type, merged.country || null, merged.language || null, merged.topic_tags || null, template, merged.submission_mode, approvalStatus, effectiveSourceEnabled(approvalStatus as never, requestedEnabled), merged.audit_flags || null, merged.last_checked_at || null, merged.memo || null]
        const result = await context.env.DB.prepare(`UPDATE link_sources SET name=?,source_url=?,source_type=?,country=?,language=?,topic_tags=?,url_template=?,submission_mode=?,approval_status=?,enabled=?,audit_flags=?,last_checked_at=?,memo=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *`).bind(...values, id).run<LinkSource>()
        const updatedSource = result.results?.[0]
        if (updatedSource && (approvalStatus !== '已批准' || Number(updatedSource.enabled) !== 1)) {
            await context.env.DB.prepare(`UPDATE website_link_opportunities SET status='已暂停', updated_at=CURRENT_TIMESTAMP WHERE source_id=? AND status IN ('待处理','已生成提交地址')`).bind(id).run()
        }
        return json(updatedSource || null, 200, '外链来源已更新')
    } catch (error) { return json(null, 409, error instanceof Error ? error.message : '外链来源更新失败') }
}

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = Number(context.params.id)
        const linked = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM website_link_opportunities WHERE source_id=?').bind(id).first<{ count: number }>()
        if (Number(linked?.count || 0) > 0) return json(null, 409, '已有网站外链候选关联此来源，请先停用来源')
        const result = await context.env.DB.prepare('DELETE FROM link_sources WHERE id=?').bind(id).run()
        return result.meta.changes ? json(null, 200, '外链来源已删除') : json(null, 404, '外链来源不存在')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '外链来源删除失败') }
}
