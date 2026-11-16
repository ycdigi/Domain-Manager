export const batchStatuses = ['进行中', '待复盘', '已复盘', '已归档'] as const
export type BatchStatus = typeof batchStatuses[number]
export const fixedScenarios = ['Astro 内容站', 'WordPress 计算器站', 'WordPress 资讯站', '通用网站'] as const

const maxText = (value: unknown, max: number) => value == null || typeof value === 'string' && value.length <= max
const optionalDate = (value: unknown) => value == null || value === '' || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const validateScenarioFields = (fields: Record<string, unknown>, current: Record<string, unknown> = {}) => {
    const next = { ...current, ...fields }
    if (fields.operating_scenario !== undefined && fields.operating_scenario !== null && fields.operating_scenario !== '' && (!maxText(fields.operating_scenario, 100) || !(fixedScenarios as readonly string[]).includes(String(fields.operating_scenario)) && !String(fields.operating_scenario).trim())) return '经营场景值无效'
    if (fields.scenario_note !== undefined && !maxText(fields.scenario_note, 500)) return '场景说明不能超过 500 个字符'
    if (fields.page_count !== undefined && fields.page_count !== null && (!Number.isSafeInteger(fields.page_count) || Number(fields.page_count) < 0)) return '页面数量必须是非负整数'
    if (fields.content_stats_updated_date !== undefined && !optionalDate(fields.content_stats_updated_date)) return 'content_stats_updated_date 必须是有效日期'
    if ((fields.page_count !== undefined && fields.page_count !== null || fields.wp_calculator_count !== undefined && fields.wp_calculator_count !== null || fields.wp_article_count !== undefined && fields.wp_article_count !== null) && !optionalDate(fields.content_stats_updated_date) || (fields.page_count !== undefined && fields.page_count !== null || fields.wp_calculator_count !== undefined && fields.wp_calculator_count !== null || fields.wp_article_count !== undefined && fields.wp_article_count !== null) && !fields.content_stats_updated_date && !current.content_stats_updated_date) return '更新内容数量时必须填写统计日期'
    if (next.platform !== 'WordPress' && (fields.wp_calculator_count != null || fields.wp_article_count != null)) return '只有 WordPress 网站可以填写文章和计算器数量'
    return null
}

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
    scenario_counts: counts(rows, 'operating_scenario'),
    stage_counts: counts(rows, 'stage'),
    content_totals: {
        page_count: rows.reduce((sum, row) => sum + (Number(row.page_count) || 0), 0),
        wp_article_count: rows.reduce((sum, row) => sum + (Number(row.wp_article_count) || 0), 0),
        wp_calculator_count: rows.reduce((sum, row) => sum + (Number(row.wp_calculator_count) || 0), 0)
    }
})

export const snapshotMatches = (snapshot: Record<string, unknown> | null, rows: Array<Record<string, unknown>>) => {
    if (!snapshot) return false
    const current = batchSnapshot(rows)
    return JSON.stringify(current) === JSON.stringify({ member_count: snapshot.member_count, scenario_counts: parseJson(snapshot.scenario_counts), stage_counts: parseJson(snapshot.stage_counts), content_totals: parseJson(snapshot.content_totals) })
}

export const getBatchMemberRows = async (db: D1Database, batchId: number) => {
    const result = await db.prepare(`SELECT m.id AS membership_id,m.batch_id,m.website_id,m.joined_at,m.member_note,m.membership_status,m.removed_at,m.removed_reason,w.name,w.stage,w.lifecycle,w.platform,w.operating_scenario,w.scenario_note,w.page_count,w.wp_article_count,w.wp_calculator_count,w.content_stats_updated_date FROM website_batch_members m JOIN websites w ON w.id=m.website_id WHERE m.batch_id=? ORDER BY CASE WHEN m.membership_status='active' THEN 0 ELSE 1 END,m.joined_at,m.website_id`).bind(batchId).all<Record<string, unknown>>()
    return result.results || []
}

export const getBatchDetail = async (db: D1Database, batchId: number) => {
    const batch = await db.prepare('SELECT * FROM website_batches WHERE id=?').bind(batchId).first<Record<string, unknown>>()
    if (!batch) return null
    const members = await getBatchMemberRows(db, batchId)
    const latest = await db.prepare('SELECT * FROM website_batch_reviews WHERE batch_id=? ORDER BY reviewed_at DESC,id DESC LIMIT 1').bind(batchId).first<Record<string, unknown>>()
    const active = members.filter(row => row.membership_status === 'active')
    return { ...batch, members, latest_review: latest ? { ...latest, scenario_counts: parseJson(latest.scenario_counts), stage_counts: parseJson(latest.stage_counts), content_totals: parseJson(latest.content_totals) } : null, review_changed: batch.status === '已复盘' && Boolean(latest) && !snapshotMatches(latest, active) } as Record<string, any>
}
