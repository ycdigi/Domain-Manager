/// <reference types="@cloudflare/workers-types" />

export interface Env {
    DB: D1Database
    USER: string
    PASS: string
    API_TOKEN: string
    ASSETS: {
        fetch: typeof fetch
    }
    TELEGRAM_BOT_TOKEN: string
    TELEGRAM_CHAT_ID: string
    CREDENTIAL_ENCRYPTION_KEY?: string
}

export interface Domain {
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
    site_name?: string | null
    industry?: string | null
    adsense_account_id?: number | null
    adsense_account_name?: string | null
    adsense_owner?: string | null
    adsense_publisher_id?: string | null
    adsense_connected?: string
    adsense_opened_date?: string | null
    seo_last_date?: string | null
    daily_clicks?: number | null
    daily_clicks_range?: 'under10' | '10to29' | '30to49' | '50to99' | 'over100' | null
    clicks_updated_date?: string | null
    platform?: DomainPlatform
    platform_other?: string | null
    wp_calculator_count?: number | null
    wp_article_count?: number | null
    content_stats_updated_date?: string | null
    last_status_check_at?: string | null
    last_expiry_alert_date?: string | null
    last_offline_alert_at?: string | null
    resource_status?: string
    computer_name?: string | null
    resource_count?: number
    resource_names?: string | null
    ai_note_count?: number
    latest_operation_date?: string | null
    operation_count?: number
    adsense_open_days?: number | null
    created_at?: string
}

export type DomainPlatform = 'WordPress' | 'Astro' | 'Next.js' | '其他'
export type DomainOperationKind = 'SEO' | '内容' | '技术' | '其他'

export interface DomainOperation {
    id?: number
    domain_id: number
    operation_date: string
    operation_kind: DomainOperationKind
    created_at?: string
}

export type DomainAiNoteKind = 'AI提示词' | '想法说明'

export interface DomainAiNote {
    id?: number
    domain_id: number
    kind: DomainAiNoteKind
    content: string
    created_at?: string
    updated_at?: string
    archived_at?: string | null
    version_count?: number
}

export interface DomainAiNoteVersion {
    id?: number
    note_id: number
    kind: DomainAiNoteKind
    content: string
    version_no: number
    created_at?: string
}

export interface AdsenseAccount {
    id?: number
    name: string
    owner: string
    currency: string
    status: string
    publisher_id?: string | null
    memo: string
    created_at?: string
    linked_domains?: number
    current_income?: number
}

export interface AdsenseIncome {
    id?: number
    adsense_account_id: number
    income_month: string
    amount: number
    amount_usd: number
    amount_cny?: number | null
    transfer_date?: string | null
    memo: string
    created_at?: string
    site_amounts?: Array<{ domain_id: number; domain: string; site_name?: string | null; amount_usd: number }>
}

export type ProviderType = 'github' | 'cloudflare' | 'vhost' | 'vps'

export interface ProviderAccount {
    id?: number
    provider: ProviderType
    name: string
    login_email?: string | null
    status: string
    memo?: string
    created_at?: string
    updated_at?: string
    resource_count?: number
    linked_domain_count?: number
    active_resource_count?: number
}

export interface ProviderResource {
    id?: number
    account_id?: number | null
    provider: ProviderType
    name: string
    resource_url?: string | null
    identifier?: string | null
    ip_address?: string | null
    port?: number | null
    region?: string | null
    status: string
    expires_at?: string | null
    memo?: string | null
    account_name?: string | null
    linked_domain_count?: number
    created_at?: string
    updated_at?: string
}

export interface DomainResourceLink {
    id?: number
    domain_id: number
    resource_id: number
    role: string
    is_primary: number
    memo?: string | null
    resource?: ProviderResource
}

export interface ProviderCredential {
    id?: number
    account_id: number
    label: string
    token_last4?: string | null
    expires_at?: string | null
    status: string
    created_at?: string
    updated_at?: string
}
