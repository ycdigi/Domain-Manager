interface Env {
    DB: D1Database
}

interface ApiResponse<T = any> {
    status: number
    message: string
    data: T
}

interface Domain {
    id?: number
    domain: string
    registrar: string
    registrar_link: string
    registrar_date: string
    expiry_date: string
    service_type: string
    status: string
    memo: string
    site_name?: string | null
    industry?: string | null
    created_at?: string
}

export type { Env, ApiResponse, Domain }
