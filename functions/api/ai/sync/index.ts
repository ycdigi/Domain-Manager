import type { Env, Domain, DomainAiNoteKind, DomainOperationKind } from '../../../types'
import { checkApiToken } from '../../../utils/auth'
import { dailyClicksRangeFromNumber, isValidDate, isValidDailyClicksRange, normalizeDomain, todayShanghaiDate, validateDomain } from '../../../utils/domain-validation'

type SyncFields = Partial<Pick<Domain, 'status' | 'site_name' | 'industry' | 'seo_last_date' | 'daily_clicks' | 'daily_clicks_range' | 'clicks_updated_date' | 'platform' | 'platform_other' | 'wp_calculator_count' | 'wp_article_count' | 'content_stats_updated_date' | 'adsense_connected' | 'adsense_opened_date' | 'memo'>> & {
    adsense_account?: string | null
}

interface SyncBody {
    domain: string
    fields?: SyncFields
    operation?: { operation_date?: string; operation_kind: DomainOperationKind }
    ai_notes?: Array<{ kind: DomainAiNoteKind; content: string }>
}

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const operationKinds: DomainOperationKind[] = ['SEO', '内容', '技术', '其他']
const noteKinds: DomainAiNoteKind[] = ['AI提示词', '想法说明']
const fieldNames = new Set(['status', 'site_name', 'industry', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'platform', 'platform_other', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'adsense_connected', 'adsense_opened_date', 'memo', 'adsense_account'])

const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key)

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkApiToken(context)
    if (authError) return authError

    try {
        const contentLength = Number(context.request.headers.get('content-length') || 0)
        if (contentLength > 200_000) return json(null, 413, 'AI 同步请求不能超过 200 KB')
        const body = await context.request.json() as SyncBody
        if (!body || typeof body.domain !== 'string' || !body.domain.trim()) return json(null, 400, 'domain 是必填字段')
        if (body.fields !== undefined && (!body.fields || typeof body.fields !== 'object' || Object.keys(body.fields).some(key => !fieldNames.has(key)))) return json(null, 400, 'fields 包含不支持的字段')
        if (body.operation && (!operationKinds.includes(body.operation.operation_kind) || (body.operation.operation_date !== undefined && !isValidDate(body.operation.operation_date)))) return json(null, 400, 'operation 日期或类型无效')
        if (body.ai_notes !== undefined && (!Array.isArray(body.ai_notes) || body.ai_notes.length > 20)) return json(null, 400, 'ai_notes 最多支持 20 条记录')
        for (const note of body.ai_notes || []) {
            if (!noteKinds.includes(note.kind) || typeof note.content !== 'string' || !note.content.trim() || note.content.length > 20000) return json(null, 400, 'AI 记录格式无效或内容过长')
        }

        const normalizedDomain = normalizeDomain(body.domain)
        const db = context.env.DB
        const current = await db.prepare(`
            SELECT d.*, a.id AS current_adsense_account_id
            FROM domains d LEFT JOIN adsense_accounts a ON a.id = d.adsense_account_id
            WHERE lower(rtrim(d.domain, '.')) = ? LIMIT 1
        `).bind(normalizedDomain).first<Domain & { current_adsense_account_id: number | null }>()
        if (!current?.id) return json(null, 404, '域名不存在，AI 同步接口不会自动创建域名')

        const fields = body.fields || {}
        if (has(fields, 'memo') && fields.memo != null && (typeof fields.memo !== 'string' || fields.memo.length > 20000)) return json(null, 400, 'memo 不能超过 20000 个字符')
        let adsenseAccountId = current.adsense_account_id ?? null
        if (has(fields, 'adsense_account')) {
            if (fields.adsense_account != null && typeof fields.adsense_account !== 'string') return json(null, 400, 'adsense_account 必须是账号名称或空值')
            const accountName = typeof fields.adsense_account === 'string' ? fields.adsense_account.trim() : ''
            if (accountName) {
                const account = await db.prepare('SELECT id FROM adsense_accounts WHERE name = ?').bind(accountName).first<{ id: number }>()
                if (!account) return json(null, 400, `找不到 AdSense 账号：${accountName}`)
                adsenseAccountId = account.id
            } else {
                adsenseAccountId = null
            }
        }

        const merged = {
            ...current,
            ...fields,
            adsense_account_id: adsenseAccountId,
            registrar: current.registrar,
            registrar_date: current.registrar_date,
            expiry_date: current.expiry_date,
            service_type: current.service_type,
            domain: normalizedDomain
        }
        if (fields.platform && fields.platform !== 'WordPress') {
            merged.wp_calculator_count = null
            merged.wp_article_count = null
            merged.content_stats_updated_date = null
        }
        if (fields.platform && fields.platform !== '其他') merged.platform_other = null
        const validationError = validateDomain(merged)
        if (validationError) return json(null, 400, validationError)

        const statements: D1PreparedStatement[] = []
        const assignments: string[] = []
        const values: unknown[] = []
        const appliedFields: string[] = []
        const addField = (name: string, value: unknown) => { assignments.push(`${name} = ?`); values.push(value); appliedFields.push(name) }

        for (const name of ['status', 'site_name', 'industry', 'seo_last_date', 'platform', 'platform_other', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'adsense_connected', 'adsense_opened_date', 'memo'] as const) {
            if (has(fields, name)) addField(name, fields[name] === '' ? null : fields[name])
        }
        if (has(fields, 'adsense_account')) addField('adsense_account_id', adsenseAccountId)
        if (has(fields, 'daily_clicks')) {
            addField('daily_clicks', fields.daily_clicks ?? null)
            addField('daily_clicks_range', fields.daily_clicks_range ?? dailyClicksRangeFromNumber(fields.daily_clicks))
            addField('clicks_updated_date', fields.daily_clicks == null ? null : (fields.clicks_updated_date || todayShanghaiDate()))
        } else if (has(fields, 'daily_clicks_range')) {
            if (fields.daily_clicks_range !== null && !isValidDailyClicksRange(fields.daily_clicks_range)) return json(null, 400, '日点击区间无效')
            addField('daily_clicks_range', fields.daily_clicks_range || null)
            addField('clicks_updated_date', fields.daily_clicks_range ? (fields.clicks_updated_date || todayShanghaiDate()) : null)
        } else if (has(fields, 'clicks_updated_date')) {
            addField('clicks_updated_date', fields.clicks_updated_date || null)
        }
        if (has(fields, 'status')) addField('last_status_check_at', todayShanghaiDate())

        if (assignments.length) {
            if (fields.platform && fields.platform !== 'WordPress') {
                addField('wp_calculator_count', null)
                addField('wp_article_count', null)
                addField('content_stats_updated_date', null)
            }
            if (fields.platform && fields.platform !== '其他') addField('platform_other', null)
            statements.push(db.prepare(`UPDATE domains SET ${assignments.join(', ')} WHERE id = ?`).bind(...values, current.id))
        }

        if (body.operation) {
            statements.push(db.prepare(`
                INSERT OR IGNORE INTO domain_operations (domain_id, operation_date, operation_kind)
                VALUES (?, ?, ?)
            `).bind(current.id, body.operation.operation_date || todayShanghaiDate(), body.operation.operation_kind))
        }

        for (const note of body.ai_notes || []) {
            const content = note.content.trim()
            statements.push(db.prepare(`
                INSERT INTO domain_ai_notes (domain_id, kind, content)
                SELECT ?, ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM domain_ai_notes
                    WHERE domain_id = ? AND kind = ? AND content = ? AND archived_at IS NULL
                )
            `).bind(current.id, note.kind, content, current.id, note.kind, content))
            statements.push(db.prepare(`
                INSERT INTO domain_ai_note_versions (note_id, kind, content, version_no)
                SELECT n.id, n.kind, n.content, COALESCE(MAX(v.version_no), 0) + 1
                FROM domain_ai_notes n
                LEFT JOIN domain_ai_note_versions v ON v.note_id = n.id
                WHERE n.domain_id = ? AND n.kind = ? AND n.content = ? AND n.archived_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM domain_ai_note_versions existing
                      WHERE existing.note_id = n.id AND existing.content = n.content
                  )
                GROUP BY n.id, n.kind, n.content
            `).bind(current.id, note.kind, content))
        }

        if (statements.length) await db.batch(statements)
        const updated = await db.prepare(`
            SELECT d.*, a.name AS adsense_account_name, a.owner AS adsense_owner, a.publisher_id AS adsense_publisher_id,
                   CASE WHEN d.adsense_opened_date IS NOT NULL AND d.registrar_date IS NOT NULL AND d.adsense_opened_date >= d.registrar_date
                        THEN CAST(julianday(d.adsense_opened_date) - julianday(d.registrar_date) AS INTEGER) ELSE NULL END AS adsense_open_days,
                   (SELECT COUNT(*) FROM domain_ai_notes n WHERE n.domain_id = d.id AND n.archived_at IS NULL) AS ai_note_count,
                   (SELECT MAX(o.operation_date) FROM domain_operations o WHERE o.domain_id = d.id) AS latest_operation_date
            FROM domains d LEFT JOIN adsense_accounts a ON a.id = d.adsense_account_id WHERE d.id = ?
        `).bind(current.id).first()
        return json({ domain: updated, applied: { fields: appliedFields, operation: body.operation ? 1 : 0, ai_notes: body.ai_notes?.length || 0 } }, 200, 'AI 同步完成')
    } catch (error) {
        console.error('AI 同步失败:', error)
        return json(null, 500, error instanceof Error ? error.message : 'AI 同步失败')
    }
}
