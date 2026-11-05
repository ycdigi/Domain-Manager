import request from '../utils/request'

export interface DomainData {
    id?: number
    domain: string
    registrar: string
    registrar_link: string
    registrar_date: string
    expiry_date: string
    service_type: string
    status: string
    tgsend: number
    st_tgsend: number
    memo: string
    computer_name?: string | null
    site_name: string | null
    industry: string | null
    adsense_account_id: number | null
    adsense_account_name?: string | null
    adsense_owner?: string | null
    adsense_publisher_id?: string | null
    adsense_connected: '未知' | '已开通' | '未开通'
    adsense_opened_date: string | null
    seo_last_date: string | null
    daily_clicks: number | null
    daily_clicks_range: 'under10' | '10to29' | '30to49' | '50to99' | 'over100' | null
    clicks_updated_date: string | null
    platform: 'WordPress' | 'Astro' | 'Next.js' | '其他'
    platform_other: string | null
    wp_calculator_count: number | null
    wp_article_count: number | null
    content_stats_updated_date: string | null
    last_status_check_at: string | null
    resource_status: string
    resource_count?: number
    resource_names?: string | null
    ai_note_count?: number
    latest_operation_date?: string | null
    operation_count?: number
    adsense_open_days?: number | null
    created_at?: string
}

// 获取域名列表
export const getDomains = () => {
    return request.get<DomainData[]>('/api/domains')
}

// 创建域名
export const createDomain = (data: Omit<DomainData, 'id' | 'created_at'>) => {
    return request.post<DomainData>('/api/domains', data)
}

// 更新域名
export const updateDomain = (id: number, data: Omit<DomainData, 'id' | 'created_at'>) => {
    return request.put<DomainData>(`/api/domains/${id}`, data)
}

// 删除域名
export const deleteDomain = (id: number) => {
    return request.delete<void>(`/api/domains/${id}`)
}
