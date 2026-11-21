export const batchStatuses = ['进行中', '待复盘', '已复盘', '已归档'] as const
export type BatchStatus = typeof batchStatuses[number]

const maxText = (value: unknown, max: number) => value == null || typeof value === 'string' && value.length <= max
const optionalDate = (value: unknown) => value == null || value === '' || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const validateBatchFields = (fields: Record<string, unknown>, current: Record<string, unknown> = {}) => {
    const next = { ...current, ...fields }
    if (fields.name !== undefined && (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.length > 200)) return '批次名称必填且不能超过 200 个字符'
    for (const key of ['source', 'goal', 'hypothesis', 'review_conclusion', 'next_action']) if (!maxText(fields[key], 2000)) return `${key} 不能超过 2000 个字符`
    if (fields.status !== undefined && !(batchStatuses as readonly string[]).includes(String(fields.status))) return '批次状态无效'
    if (next.status === '已归档' && fields.archived_at !== undefined && !optionalDate(fields.archived_at)) return '归档日期无效'
    return null
}

const parseJson = (value: unknown) => { try { return typeof value === 'string' ? JSON.parse(value) : value || {} } catch { return {} } }
const counts = (rows: Array<Record<string, unknown>>, key: string) => rows.reduce<Record<string, number>>((result, row) => { const value = String(row[key] || '未设置'); result[value] = (result[value] || 0) + 1; return result }, {})

export const batchSnapshot = (rows: Array<Record<string, unknown>>) => ({
    member_count: rows.length,
    stage_counts: counts(rows, 'stage'),
    content_totals: {
        page_count: rows.reduce((sum, row) => sum + (Number(row.page_count) || 0), 0),
        article_count: rows.reduce((sum, row) => sum + (Number(row.article_count) || 0), 0),
        calculator_count: rows.reduce((sum, row) => sum + (Number(row.calculator_count) || 0), 0)
    }
})

export const snapshotMatches = (snapshot: Record<string, unknown> | null, rows: Array<Record<string, unknown>>) => {
    if (!snapshot) return false
    const current = batchSnapshot(rows)
    const totals = parseJson(snapshot.content_totals)
    const stages = parseJson(snapshot.stage_counts)
    return current.member_count === snapshot.member_count
        && JSON.stringify(Object.entries(current.stage_counts).sort()) === JSON.stringify(Object.entries(stages).sort())
        && current.content_totals.page_count === Number(totals.page_count || 0)
        && current.content_totals.article_count === Number(totals.article_count ?? 0)
        && current.content_totals.calculator_count === Number(totals.calculator_count ?? 0)
}

export const getBatchMemberRows = async (db: D1Database, batchId: number) => {
    const result = await db.prepare(`SELECT m.id AS membership_id,m.batch_id,m.website_id,m.joined_at,m.member_note,m.membership_status,m.removed_at,m.removed_reason,w.name,w.stage,w.lifecycle,w.platform,w.page_count,w.article_count,w.calculator_count,w.content_stats_updated_date FROM website_batch_members m JOIN websites w ON w.id=m.website_id WHERE m.batch_id=? ORDER BY CASE WHEN m.membership_status='active' THEN 0 ELSE 1 END,m.joined_at,m.website_id`).bind(batchId).all<Record<string, unknown>>()
    return result.results || []
}

export const getBatchDetail = async (db: D1Database, batchId: number) => {
    const batch = await db.prepare('SELECT * FROM website_batches WHERE id=?').bind(batchId).first<Record<string, unknown>>()
    if (!batch) return null
    const members = await getBatchMemberRows(db, batchId)
    const latest = await db.prepare('SELECT * FROM website_batch_reviews WHERE batch_id=? ORDER BY reviewed_at DESC,id DESC LIMIT 1').bind(batchId).first<Record<string, unknown>>()
    const active = members.filter(row => row.membership_status === 'active')
    return { ...batch, members, latest_review: latest ? { ...latest, stage_counts: parseJson(latest.stage_counts), content_totals: parseJson(latest.content_totals) } : null, review_changed: batch.status === '已复盘' && Boolean(latest) && !snapshotMatches(latest, active) } as Record<string, any>
}
