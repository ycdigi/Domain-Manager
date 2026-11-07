import type { WebsiteAiNote, WebsiteAiNoteKind, WebsiteAiNoteVersion, Env } from '../../../../../types'
import { checkAuth } from '../../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const kinds = new Set<WebsiteAiNoteKind>(['AI提示词', '想法说明'])
const idOf = (value: unknown) => /^\d+$/.test(String(value || '')) ? Number(value) : 0
const validate = (kind: unknown, content: unknown) => {
    if (!kinds.has(kind as WebsiteAiNoteKind)) return '记录类型无效'
    if (typeof content !== 'string' || !content.trim()) return '内容不能为空'
    if (content.length > 20000) return '内容不能超过 20000 个字符'
    return null
}
const findNote = (db: D1Database, websiteId: number, noteId: number) => db.prepare('SELECT * FROM website_ai_notes WHERE id=? AND website_id=?').bind(noteId, websiteId).first<WebsiteAiNote>()

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const websiteId = idOf(context.params.id); const noteId = idOf(context.params.note_id)
    if (!websiteId || !noteId) return json(null, 400, '编号无效')
    try {
        const body = await context.request.json() as Partial<WebsiteAiNote>
        const validationError = validate(body.kind, body.content)
        if (validationError) return json(null, 400, validationError)
        const current = await findNote(context.env.DB, websiteId, noteId)
        if (!current || current.archived_at) return json(null, 404, '记录不存在')
        const nextVersion = Number((await context.env.DB.prepare('SELECT COALESCE(MAX(version_no),0)+1 AS next_version FROM website_ai_note_versions WHERE note_id=?').bind(noteId).first<{ next_version: number }>())?.next_version || 1)
        const content = (body.content as string).trim()
        const result = await context.env.DB.batch([
            context.env.DB.prepare('UPDATE website_ai_notes SET kind=?, content=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND website_id=?').bind(body.kind, content, noteId, websiteId),
            context.env.DB.prepare('INSERT INTO website_ai_note_versions (note_id, kind, content, version_no) VALUES (?, ?, ?, ?)').bind(noteId, body.kind, content, nextVersion)
        ])
        if (!result[0]?.success) return json(null, 500, '记录更新失败')
        return json({ ...await findNote(context.env.DB, websiteId, noteId), version_count: nextVersion }, 200, '记录已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '更新 AI 记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const websiteId = idOf(context.params.id); const noteId = idOf(context.params.note_id)
    if (!websiteId || !noteId) return json(null, 400, '编号无效')
    try {
        const note = await findNote(context.env.DB, websiteId, noteId)
        if (!note || note.archived_at) return json(null, 404, '记录不存在')
        await context.env.DB.prepare('UPDATE website_ai_notes SET archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND website_id=?').bind(noteId, websiteId).run()
        return json(null, 200, '记录已归档')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '归档 AI 记录失败') }
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const websiteId = idOf(context.params.id); const noteId = idOf(context.params.note_id)
    if (!websiteId || !noteId) return json(null, 400, '编号无效')
    try {
        if (!await findNote(context.env.DB, websiteId, noteId)) return json(null, 404, '记录不存在')
        const versions = await context.env.DB.prepare('SELECT * FROM website_ai_note_versions WHERE note_id=? ORDER BY version_no DESC').bind(noteId).all<WebsiteAiNoteVersion>()
        return json(versions.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 AI 记录历史失败') }
}
