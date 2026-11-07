import type { WebsiteAiNote, WebsiteAiNoteKind, Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const kinds = new Set<WebsiteAiNoteKind>(['AI提示词', '想法说明'])
const maxContentLength = 20000
const validate = (kind: unknown, content: unknown) => {
    if (!kinds.has(kind as WebsiteAiNoteKind)) return '记录类型无效'
    if (typeof content !== 'string' || !content.trim()) return '内容不能为空'
    if (content.length > maxContentLength) return `内容不能超过 ${maxContentLength} 个字符`
    return null
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const websiteId = Number(context.params.id)
    if (!Number.isInteger(websiteId) || websiteId < 1) return json(null, 400, '网站编号无效')
    try {
        const rows = await context.env.DB.prepare(`
            SELECT n.*, (SELECT COUNT(*) FROM website_ai_note_versions v WHERE v.note_id=n.id) AS version_count
            FROM website_ai_notes n WHERE n.website_id=? AND n.archived_at IS NULL
            ORDER BY CASE n.kind WHEN 'AI提示词' THEN 0 ELSE 1 END, n.updated_at DESC, n.id DESC
        `).bind(websiteId).all<WebsiteAiNote>()
        return json(rows.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 AI 记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const websiteId = Number(context.params.id)
    if (!Number.isInteger(websiteId) || websiteId < 1) return json(null, 400, '网站编号无效')
    try {
        const body = await context.request.json() as Partial<WebsiteAiNote>
        const validationError = validate(body.kind, body.content)
        if (validationError) return json(null, 400, validationError)
        if (!await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first()) return json(null, 404, '网站不存在')
        const result = await context.env.DB.prepare('INSERT INTO website_ai_notes (website_id, kind, content) VALUES (?, ?, ?) RETURNING *')
            .bind(websiteId, body.kind, (body.content as string).trim()).first<WebsiteAiNote>()
        if (!result?.id) return json(null, 500, '记录创建失败')
        await context.env.DB.prepare('INSERT INTO website_ai_note_versions (note_id, kind, content, version_no) VALUES (?, ?, ?, 1)')
            .bind(result.id, result.kind, result.content).run()
        return json({ ...result, version_count: 1 }, 201, '记录已创建')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '创建 AI 记录失败') }
}
