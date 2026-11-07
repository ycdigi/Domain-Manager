export const dailyClicksRanges = ['under10', '10to29', '30to49', '50to99', 'over100'] as const

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

export interface DomainInput {
    domain?: string
    registrar?: string
    registrar_link?: string | null
    registrar_date?: string
    expiry_date?: string
    service_type?: string
    status?: string
}

export const validateDomain = (data: DomainInput) => {
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
    return null
}

export const todayShanghaiDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
