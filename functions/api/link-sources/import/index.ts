import type { Env } from '../../../types'
import { checkAuth } from '../../../utils/auth'
import { sourceTypeValues } from '../../../domain/link-sources'
import { normalizeSourceUrl, normalizeUrlTemplate } from '../../../../shared/link-sources'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const body = await context.request.json() as { sources?: Array<Record<string, unknown>>; rows?: Array<Record<string, unknown>> }
        const rows = body.sources || body.rows
        if (!Array.isArray(rows) || rows.length > 1000) return json(null, 400, 'sources 必须是最多 1000 项的数组')
        const created: number[] = []; const skipped: Array<{ index: number; error: string }> = []
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index] || {}
            const sourceUrl = normalizeSourceUrl(row.source_url)
            const templateResult = row.url_template == null || row.url_template === '' ? { template: null, error: undefined } : normalizeUrlTemplate(row.url_template)
            if (!sourceUrl || templateResult.error || (row.source_type != null && !sourceTypeValues.includes(row.source_type as never))) {
                skipped.push({ index, error: templateResult.error || '来源 URL 或来源类型无效' }); continue
            }
            const name = String(row.name || (() => { try { return new URL(sourceUrl).hostname } catch { return sourceUrl } })()).trim()
            if (!name || name.length > 200) { skipped.push({ index, error: '来源名称无效' }); continue }
            const exists = await context.env.DB.prepare('SELECT id FROM link_sources WHERE source_url=? AND url_template IS ?').bind(sourceUrl, templateResult.template).first<{ id: number }>()
            if (exists) { skipped.push({ index, error: '来源模板已存在' }); continue }
            try {
                const result = await context.env.DB.prepare(`INSERT INTO link_sources (name,source_url,source_type,country,language,topic_tags,url_template,submission_mode,approval_status,enabled,audit_flags,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(name, sourceUrl, row.source_type || '无法判断', row.country || null, row.language || null, row.topic_tags || null, templateResult.template, '仅观察', '待审核', 0, Array.isArray(row.audit_flags) ? row.audit_flags.join('；') : row.audit_flags || null, row.memo || null).run<{ id: number }>()
                const id = result.results?.[0]?.id
                if (id) created.push(id)
            } catch (error) { skipped.push({ index, error: error instanceof Error ? error.message : '来源写入失败' }) }
        }
        return json({ total: rows.length, created: created.length, created_ids: created, skipped }, skipped.length && !created.length ? 400 : 200, created.length ? '外链来源导入完成' : '没有导入新的外链来源')
    } catch (error) { return json(null, 400, error instanceof Error ? error.message : '外链来源导入失败') }
}
