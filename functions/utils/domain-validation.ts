import type { Domain, DomainPlatform } from '../types'

const platforms: DomainPlatform[] = ['WordPress', 'Astro', 'Next.js', '其他']

export const isValidDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const normalizeDomain = (value: string) => value.trim().toLowerCase().replace(/\.$/, '')
export const isIpAddress = (value: string) => {
    const parts = value.split('.')
    if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return true
    try { return new URL(`http://[${value}]/`).hostname.length > 0 } catch { return false }
}

export const validateDomain = (data: Partial<Domain>) => {
    if (typeof data.domain !== 'string' || !/^(?=.{3,255}$)[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/.test(normalizeDomain(data.domain))) return '域名格式无效'
    for (const field of ['registrar', 'registrar_date', 'expiry_date', 'service_type', 'status'] as const) {
        if (typeof data[field] !== 'string' || !data[field].trim()) return `${field} 是必填字段`
    }
    if (data.registrar_link) {
        try { if (!['http:', 'https:'].includes(new URL(data.registrar_link).protocol)) return '域名商链接必须使用 HTTP 或 HTTPS' }
        catch { return '域名商链接格式无效' }
    }
    if (!isValidDate(data.registrar_date) || !isValidDate(data.expiry_date)) return '注册日期和到期日期必须是有效的 YYYY-MM-DD 日期'
    if (data.status !== '在线' && data.status !== '离线') return '网站状态无效'
    if (data.adsense_connected !== undefined && !['未知', '已开通', '未开通'].includes(data.adsense_connected)) return 'AdSense 网站状态无效'
    if ((data.adsense_connected || '未知') === '已开通' && !isValidDate(data.adsense_opened_date)) return '已开通时必须填写有效开通日期'
    if (data.adsense_opened_date && data.registrar_date && data.adsense_opened_date < data.registrar_date) return 'AdSense 开通日期不能早于域名注册日期'
    if (data.adsense_opened_date != null && data.adsense_opened_date !== '' && !isValidDate(data.adsense_opened_date)) return 'AdSense 开通日期无效'
    if (data.seo_last_date != null && data.seo_last_date !== '' && !isValidDate(data.seo_last_date)) return 'SEO 日期无效'
    if (data.daily_clicks != null && (!Number.isInteger(data.daily_clicks) || data.daily_clicks < 0)) return '日点击次数必须是非负整数'
    if (data.clicks_updated_date != null && data.clicks_updated_date !== '' && !isValidDate(data.clicks_updated_date)) return '点击数据日期无效'
    if (data.adsense_account_id != null && (!Number.isInteger(data.adsense_account_id) || data.adsense_account_id <= 0)) return 'AdSense 账号编号无效'
    if (data.adsense_connected === '已开通' && (data.adsense_account_id == null || data.adsense_account_id <= 0)) return '已开通时必须选择 AdSense 账号'
    if (data.platform !== undefined && !platforms.includes(data.platform as DomainPlatform)) return '网站技术栈无效'
    if ((data.platform || '其他') === '其他' && data.platform_other != null && data.platform_other.length > 100) return '其他技术栈名称不能超过 100 个字符'
    for (const field of ['wp_calculator_count', 'wp_article_count'] as const) {
        const value = data[field]
        if (value != null && (!Number.isInteger(value) || value < 0)) return 'WordPress 内容数量必须是非负整数'
        if ((data.platform || '其他') !== 'WordPress' && value != null) return '只有 WordPress 网站可以填写内容数量'
    }
    if (data.content_stats_updated_date != null && data.content_stats_updated_date !== '' && !isValidDate(data.content_stats_updated_date)) return '内容统计日期无效'
    if ((data.wp_calculator_count != null || data.wp_article_count != null) && !isValidDate(data.content_stats_updated_date)) return '填写 WordPress 内容数量时必须填写统计日期'
    if (data.tgsend !== undefined && ![0, 1].includes(data.tgsend)) return '域名通知选项无效'
    if (data.st_tgsend !== undefined && ![0, 1].includes(data.st_tgsend)) return '状态通知选项无效'
    return null
}

export const todayShanghaiDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
