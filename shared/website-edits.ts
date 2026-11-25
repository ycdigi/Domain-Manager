// The field vocabulary and coupled edit groups are shared by every live editor.
export const websiteFields = ['name', 'stage', 'lifecycle', 'ownership', 'industry', 'platform', 'platform_other', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'gsc_connected', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'calculator_count', 'article_count', 'computer_name', 'content_stats_updated_date', 'potential', 'priority_order', 'next_action', 'next_action_due_date', 'next_action_status', 'new_site_override', 'page_count'] as const
export const websiteContentCounts = ['page_count', 'calculator_count', 'article_count'] as const
const groups = [
    ['platform', 'platform_other'],
    ['adsense_connected', 'adsense_account_id', 'adsense_opened_date'],
    ['daily_clicks', 'daily_clicks_range', 'clicks_updated_date']
] as const
export type WebsiteFields = Record<string, unknown>

export const normalizeWebsiteEdit = (input: WebsiteFields): WebsiteFields => {
    const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, value === '' ? null : value]))
    if (typeof fields.name === 'string') fields.name = fields.name.trim()
    if (fields.platform !== undefined && fields.platform !== '其他') fields.platform_other = null
    return fields
}

// Missing keys are untouched. Coupled values are sent together, but independent
// content counts are never copied back from a potentially stale website row.
export const websiteEditPatch = (input: object, original: object): WebsiteFields => {
    const current = original as WebsiteFields
    const next = normalizeWebsiteEdit(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value ?? null])))
    const patch = Object.fromEntries(Object.entries(next).filter(([key, value]) => !Object.is(value ?? null, current[key] === '' ? null : current[key] ?? null)))
    for (const group of groups) if (group.some(key => key in patch)) {
        for (const key of group) patch[key] = Object.prototype.hasOwnProperty.call(next, key) ? next[key] : current[key] ?? null
    }
    if (websiteContentCounts.some(key => key in patch)) patch.content_stats_updated_date = Object.prototype.hasOwnProperty.call(next, 'content_stats_updated_date') ? next.content_stats_updated_date : current.content_stats_updated_date ?? null
    return patch
}

// A measurement is an explicit observation, even when its value is unchanged.
export const websiteMetricEdit = (field: typeof websiteContentCounts[number] | 'daily_clicks', value: number | null, date: string | null, range: string | null = null): WebsiteFields => field === 'daily_clicks'
    ? { daily_clicks: range ? null : value, daily_clicks_range: range, clicks_updated_date: value !== null || range ? date : null }
    : { [field]: value, content_stats_updated_date: date }
