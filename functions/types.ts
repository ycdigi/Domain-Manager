/// <reference types="@cloudflare/workers-types" />

export interface Env {
    DB: D1Database
    USER: string
    PASS: string
    API_TOKEN: string
    ASSETS: {
        fetch: typeof fetch
    }
    CREDENTIAL_ENCRYPTION_KEY?: string
}

export interface Domain {
    id?: number
    website_id?: number | null
    domain: string
    registrar: string
    registrar_link: string
    registrar_date: string
    expiry_date: string
    service_type: string
    status: string
    domain_role?: '主域名' | '跳转域名' | '备用域名'
    is_primary?: number
    memo?: string | null
    last_status_check_at?: string | null
    computer_name?: string | null
    website_name?: string | null
    website_stage?: string | null
    created_at?: string
}

export type WebsiteOperationKind = 'SEO' | '内容' | '技术' | '其他'

export interface WebsiteOperation {
    id?: number
    website_id: number
    operation_date: string
    operation_kind: WebsiteOperationKind
    created_at?: string
}

export type WebsiteAiNoteKind = 'AI提示词' | '想法说明'

export interface WebsiteAiNote {
    id?: number
    website_id: number
    kind: WebsiteAiNoteKind
    content: string
    created_at?: string
    updated_at?: string
    archived_at?: string | null
    version_count?: number
}

export interface WebsiteAiNoteVersion {
    id?: number
    note_id: number
    kind: WebsiteAiNoteKind
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
    opened_date?: string | null
    memo: string
    created_at?: string
    linked_websites?: number
    current_income?: number
    income_usd_total?: number
    income_cny_total?: number | null
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
    linked_website_count?: number
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
    linked_website_count?: number
    created_at?: string
    updated_at?: string
}

export interface WebsiteResourceLink {
    id?: number
    website_id: number
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
