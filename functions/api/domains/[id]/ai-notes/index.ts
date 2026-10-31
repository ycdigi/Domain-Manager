import type { DomainAiNote, DomainAiNoteKind, Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const kinds = new Set<DomainAiNoteKind>(['AI提示词', '想法说明'])
const maxContentLength = 20000
const parseDomainId = (value: unknown) => /^\d+$/.test(String(value || '')) ? Number(value) : 0
const validate = (kind: unknown, content: unknown) => {
    if (!kinds.has(kind as DomainAiNoteKind)) return '记录类型无效'
    if (typeof content !== 'string' || !content.trim()) return '内容不能为空'
    if (content.length > maxContentLength) return `内容不能超过 ${maxContentLength} 个字符`
    return null
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const domainId = parseDomainId(context.params.id)
    if (!domainId) return json(null, 400, '网站编号无效')
    try {
        const rows = await context.env.DB.prepare(`
            SELECT n.*, (SELECT COUNT(*) FROM domain_ai_note_versions v WHERE v.note_id = n.id) AS version_count
            FROM domain_ai_notes n
            WHERE n.domain_id = ? AND n.archived_at IS NULL
            ORDER BY CASE n.kind WHEN 'AI提示词' THEN 0 ELSE 1 END, n.updated_at DESC, n.id DESC
        `).bind(domainId).all<DomainAiNote>()
        return json(rows.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 AI 记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const domainId = parseDomainId(context.params.id)
    if (!domainId) return json(null, 400, '网站编号无效')
    try {
        const body = await context.request.json() as Partial<DomainAiNote>
        const validationError = validate(body.kind, body.content)
        if (validationError) return json(null, 400, validationError)
        const domain = await context.env.DB.prepare('SELECT id FROM domains WHERE id = ?').bind(domainId).first()
        if (!domain) return json(null, 404, '网站不存在')
        const result = await context.env.DB.prepare(`
            INSERT INTO domain_ai_notes (domain_id, kind, content) VALUES (?, ?, ?) RETURNING *
        `).bind(domainId, body.kind, (body.content as string).trim()).run<DomainAiNote>()
        const note = result.results?.[0]
        if (!note?.id) return json(null, 500, '记录创建失败')
        await context.env.DB.prepare(`
            INSERT INTO domain_ai_note_versions (note_id, kind, content, version_no) VALUES (?, ?, ?, 1)
        `).bind(note.id, note.kind, note.content).run()
        return json({ ...note, version_count: 1 }, 201, '记录已创建')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '创建 AI 记录失败') }
}
