import { isValidDate } from '../utils/domain-validation'

type Row = Record<string, any>
const requiredText = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
const positiveId = (value: unknown) => integer(value) && Number(value) > 0
const month = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
const oneOf = (value: unknown, choices: readonly unknown[]) => choices.includes(value)
const providers = ['github', 'cloudflare', 'vhost', 'vps']
const jsonObject = (value: unknown) => {
    try { const parsed = typeof value === 'string' ? JSON.parse(value) : null; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) }
    catch { return false }
}

// Snapshot validation protects both preview and execution. It deliberately does
// not impose live-edit measurement dates or rewrite historical timestamps.
export const validateBackupRows = (input: Row) => {
    const errors: Array<{ domain: string; error: string }> = []
    const add = (table: string, error: string) => errors.push({ domain: table, error })
    const validate = (table: string, valid: (row: Row) => boolean) => {
        for (const row of input[table] || []) if (!valid(row)) add(table, '记录的必填值、类型或状态无效')
    }
    for (const [table, rows] of Object.entries(input)) {
        if (!Array.isArray(rows)) continue
        const ids = new Set<number>()
        for (const row of rows) {
            if (row.id !== undefined && (!positiveId(row.id) || ids.has(row.id))) add(table, '记录 ID 必须是唯一正整数')
            if (row.id !== undefined) ids.add(row.id)
            if (Object.values(row).some(value => value !== null && !['string', 'number'].includes(typeof value))) add(table, '备份字段必须是文本、数值或 null')
            for (const [key, value] of Object.entries(row)) {
                if (typeof value === 'number' && !Number.isFinite(value)) add(table, key + ' 必须是有限数值')
                if (key.endsWith('_at') && value != null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) add(table, key + ' 时间无效')
            }
        }
    }
    validate('website_income', row => month(row.income_month) && requiredText(row.source) && requiredText(row.currency) && nonnegative(row.amount))
    validate('website_effort', row => isValidDate(row.week_start) && nonnegative(row.hours))
    validate('adsense_income', row => month(row.income_month) && nonnegative(row.amount_usd) && (row.amount_cny == null || nonnegative(row.amount_cny)) && (row.transfer_date == null || row.transfer_date === '' || isValidDate(row.transfer_date)))
    validate('adsense_accounts', row => requiredText(row.name) && requiredText(row.owner))
    validate('provider_accounts', row => oneOf(row.provider, providers) && requiredText(row.name) && row.status !== null)
    validate('provider_resources', row => oneOf(row.provider, providers) && requiredText(row.name) && row.status !== null && (row.account_id == null || (input.provider_accounts || []).some((account: Row) => account.id === row.account_id && account.provider === row.provider)))
    validate('website_operations', row => isValidDate(row.operation_date) && oneOf(row.operation_kind, ['SEO', '内容', '技术', '其他']))
    validate('website_tasks', row => requiredText(row.title) && oneOf(row.task_type, ['SEO', '内容', '技术', '其他', 'SEO复查']) && oneOf(row.status, ['待做', '处理中', '已完成', '待跟进'])
        && (row.review_delay_days === undefined || integer(row.review_delay_days) && row.review_delay_days >= 28)
        && (row.review_window_days === undefined || integer(row.review_window_days) && row.review_window_days >= 1)
        && (row.review_conclusion == null || oneOf(row.review_conclusion, ['提升', '持平', '下降', '数据不足']))
        && (row.baseline_missing === undefined || oneOf(row.baseline_missing, [0, 1])))
    validate('website_click_snapshots', row => oneOf(row.period_kind, ['before', 'after']) && isValidDate(row.period_start) && isValidDate(row.period_end) && row.period_start <= row.period_end && integer(row.clicks))
    for (const table of ['website_ai_notes', 'website_ai_note_versions']) validate(table, row => oneOf(row.kind, ['AI提示词', '想法说明']) && typeof row.content === 'string' && (table !== 'website_ai_note_versions' || positiveId(row.version_no)))
    validate('website_batches', row => positiveId(row.id) && requiredText(row.name) && (row.status === undefined || oneOf(row.status, ['进行中', '待复盘', '已复盘', '已归档'])))
    validate('website_batch_members', row => (row.membership_status === undefined || oneOf(row.membership_status, ['active', 'removed'])) && row.joined_at !== null)
    validate('website_batch_reviews', row => integer(row.member_count) && jsonObject(row.stage_counts) && jsonObject(row.content_totals))
    validate('website_resources', row => row.is_primary === undefined || oneOf(row.is_primary, [0, 1]))

    const unique = (table: string, key: (row: Row) => unknown) => {
        const seen = new Set<unknown>()
        for (const row of input[table] || []) {
            const value = key(row)
            if (value == null) continue
            if (seen.has(value)) add(table, '备份包含重复的业务身份')
            seen.add(value)
        }
    }
    unique('adsense_accounts', row => row.name)
    unique('adsense_accounts', row => row.publisher_id || null)
    unique('provider_accounts', row => JSON.stringify([row.provider, row.name]))
    unique('provider_resources', row => row.account_id == null ? null : JSON.stringify([row.account_id, row.name]))
    unique('website_tasks', row => row.review_of_task_id ?? null)
    unique('website_batch_members', row => row.membership_status === 'removed' ? null : JSON.stringify([row.batch_id, row.website_id]))
    unique('website_resources', row => row.is_primary === 1 ? JSON.stringify([row.website_id, row.role]) : null)
    return errors
}
