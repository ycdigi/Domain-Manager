import type { Domain } from '../types'
import { dailyClicksRangeFromNumber, isValidDate, normalizeDomain, normalizeDomainType, todayShanghaiDate, validateDomain } from '../utils/domain-validation'

const columns = ['domain', 'registrar', 'registrar_link', 'registrar_date', 'expiry_date', 'service_type', 'status', 'memo', 'site_name', 'industry', 'ownership', 'computer_name', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'platform', 'platform_other', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'last_status_check_at'] as const
const defaults = { registrar_link: '', memo: '', site_name: null, industry: null, ownership: '自营网站', computer_name: null, adsense_account_id: null, adsense_connected: '未知', adsense_opened_date: null, seo_last_date: null, daily_clicks: null, daily_clicks_range: null, clicks_updated_date: null, platform: '其他', platform_other: null, wp_calculator_count: null, wp_article_count: null, content_stats_updated_date: null } as const
export class WebsiteChangeError extends Error {}
export type WebsiteChange = { record: Domain; fields: Record<string, unknown>; seoToday: boolean }

// Keep presence information until after dependent fields have been validated.
export const prepareWebsiteChange = (current: Domain | null, input: Record<string, unknown>, mode: 'create' | 'replace' | 'patch' | 'restore', today = todayShanghaiDate()): WebsiteChange => {
    const fields: Record<string, any> = {}
    for (const key of columns) if (Object.prototype.hasOwnProperty.call(input, key)) fields[key] = input[key] === '' ? null : input[key]
    if ('ownership' in input && input.ownership === '') throw new WebsiteChangeError('网站归属关系无效')
    for (const key of ['clicks_updated_date', 'content_stats_updated_date', 'last_status_check_at']) {
        if (fields[key] != null && !isValidDate(fields[key])) throw new WebsiteChangeError('统计日期无效')
    }
    if ('seo_today' in input && typeof input.seo_today !== 'boolean') throw new WebsiteChangeError('SEO 操作格式无效')
    if (mode === 'replace') {
        for (const [key, value] of Object.entries(defaults)) if (!(key in fields) && !['ownership', 'computer_name', 'daily_clicks_range', 'clicks_updated_date', 'content_stats_updated_date'].includes(key)) fields[key] = value
    }
    if ('domain' in fields && typeof fields.domain === 'string') fields.domain = normalizeDomain(fields.domain)
    if ('site_name' in fields && typeof fields.site_name === 'string') fields.site_name = fields.site_name.trim() || null
    const record = { ...defaults, ...current, ...fields } as Domain
    if (!('industry' in fields)) record.industry = normalizeDomainType(record.industry)
    if (record.platform !== 'WordPress') {
        for (const key of ['wp_article_count', 'wp_calculator_count', 'content_stats_updated_date']) {
            if (Object.prototype.hasOwnProperty.call(input, key) && input[key] != null && input[key] !== '') throw new WebsiteChangeError('只有 WordPress 网站可以填写内容数量或统计日期')
            if ('platform' in fields || mode === 'create') fields[key] = null
        }
    }
    if (record.platform !== '其他' && ('platform' in fields || 'platform_other' in fields)) fields.platform_other = null
    if ('daily_clicks' in fields || 'daily_clicks_range' in fields) {
        const hasCount = 'daily_clicks' in fields
        const count = hasCount ? fields.daily_clicks ?? null : current?.daily_clicks ?? null
        const range = 'daily_clicks_range' in fields ? fields.daily_clicks_range : dailyClicksRangeFromNumber(count)
        const oldRange = current?.daily_clicks_range || dailyClicksRangeFromNumber(current?.daily_clicks)
        const changed = range !== oldRange || (count != null && count !== current?.daily_clicks)
        if (hasCount || range == null) fields.daily_clicks = range == null ? null : count
        fields.daily_clicks_range = range
        fields.clicks_updated_date = range == null ? null : 'clicks_updated_date' in fields ? fields.clicks_updated_date : changed || !current ? today : current.clicks_updated_date ?? null
    } else if ('clicks_updated_date' in fields && record.daily_clicks == null && record.daily_clicks_range == null) {
        fields.clicks_updated_date = null
    }
    Object.assign(record, fields)
    if (record.platform === 'WordPress' && ['wp_article_count', 'wp_calculator_count', 'content_stats_updated_date'].some(key => key in fields)) {
        const changed = record.wp_article_count !== (current?.wp_article_count ?? null) || record.wp_calculator_count !== (current?.wp_calculator_count ?? null)
        fields.content_stats_updated_date = record.wp_article_count == null && record.wp_calculator_count == null ? null : 'content_stats_updated_date' in fields ? fields.content_stats_updated_date : changed ? today : current?.content_stats_updated_date ?? null
    }
    if (mode === 'patch' && 'status' in fields) fields.last_status_check_at = fields.last_status_check_at || today
    if (input.seo_today) fields.seo_last_date = today
    Object.assign(record, fields)
    if (record.computer_name != null && (typeof record.computer_name !== 'string' || record.computer_name.length > 120)) throw new WebsiteChangeError('电脑名称不能超过 120 个字符')
    const error = validateDomain(record)
    if (error) throw new WebsiteChangeError(error)
    return { record, fields: mode === 'create' ? Object.fromEntries(columns.filter(key => record[key] !== undefined).map(key => [key, record[key]])) : fields, seoToday: input.seo_today === true }
}

export const websiteWrite = (db: D1Database, change: WebsiteChange, id?: number | string, returning = true) => {
    const keys = Object.keys(change.fields)
    const values = Object.values(change.fields) as (string | number | null)[]
    const suffix = returning ? ' RETURNING *' : ''
    if (id !== undefined) return db.prepare(`UPDATE domains SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE id = ?${suffix}`).bind(...values, id)
    return db.prepare(`INSERT INTO domains (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})${suffix}`).bind(...values)
}

export const seoTodayWrite = (db: D1Database, domain: string, date: string) => db.prepare(`INSERT OR IGNORE INTO domain_operations (domain_id, operation_date, operation_kind) SELECT id, ?, 'SEO' FROM domains WHERE domain = ?`).bind(date, domain)
