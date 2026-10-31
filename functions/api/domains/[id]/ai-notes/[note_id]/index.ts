import type { DomainAiNote, DomainAiNoteKind, DomainAiNoteVersion, Env } from '../../../../../types'
import { checkAuth } from '../../../../../utils/auth'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const kinds = new Set<DomainAiNoteKind>(['AI提示词', '想法说明'])
const maxContentLength = 20000
const idOf = (value: unknown) => /^\d+$/.test(String(value || '')) ? Number(value) : 0
const validate = (kind: unknown, content: unknown) => {
    if (!kinds.has(kind as DomainAiNoteKind)) return '记录类型无效'
    if (typeof content !== 'string' || !content.trim()) return '内容不能为空'
    if (content.length > maxContentLength) return `内容不能超过 ${maxContentLength} 个字符`
    return null
}
const findNote = (db: D1Database, domainId: number, noteId: number) => db.prepare('SELECT * FROM domain_ai_notes WHERE id = ? AND domain_id = ?').bind(noteId, domainId).first<DomainAiNote>()

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const domainId = idOf(context.params.id); const noteId = idOf(context.params.note_id)
    if (!domainId || !noteId) return json(null, 400, '编号无效')
    try {
        const body = await context.request.json() as Partial<DomainAiNote>
        const validationError = validate(body.kind, body.content)
        if (validationError) return json(null, 400, validationError)
        const note = await findNote(context.env.DB, domainId, noteId)
        if (!note || note.archived_at) return json(null, 404, '记录不存在')
        const nextVersion = Number((await context.env.DB.prepare('SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM domain_ai_note_versions WHERE note_id = ?').bind(noteId).first<{ next_version: number }>())?.next_version || 1)
        const content = (body.content as string).trim()
        const result = await context.env.DB.batch([
            context.env.DB.prepare('UPDATE domain_ai_notes SET kind = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND domain_id = ?').bind(body.kind, content, noteId, domainId),
            context.env.DB.prepare('INSERT INTO domain_ai_note_versions (note_id, kind, content, version_no) VALUES (?, ?, ?, ?)').bind(noteId, body.kind, content, nextVersion)
        ])
        if (!result[0]?.success) return json(null, 500, '记录更新失败')
        const updated = await findNote(context.env.DB, domainId, noteId)
        return json({ ...updated, version_count: nextVersion }, 200, '记录已更新')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '更新 AI 记录失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const domainId = idOf(context.params.id); const noteId = idOf(context.params.note_id)
    if (!domainId || !noteId) return json(null, 400, '编号无效')
    try {
        const note = await findNote(context.env.DB, domainId, noteId)
        if (!note || note.archived_at) return json(null, 404, '记录不存在')
        await context.env.DB.prepare('UPDATE domain_ai_notes SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND domain_id = ?').bind(noteId, domainId).run()
        return json(null, 200, '记录已归档')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '归档 AI 记录失败') }
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    const domainId = idOf(context.params.id); const noteId = idOf(context.params.note_id)
    if (!domainId || !noteId) return json(null, 400, '编号无效')
    try {
        const note = await findNote(context.env.DB, domainId, noteId)
        if (!note) return json(null, 404, '记录不存在')
        const versions = await context.env.DB.prepare('SELECT * FROM domain_ai_note_versions WHERE note_id = ? ORDER BY version_no DESC').bind(noteId).all<DomainAiNoteVersion>()
        return json(versions.results || [])
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 AI 记录历史失败') }
}
