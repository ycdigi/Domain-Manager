import { useAuth } from './auth'
import router from '../router'

export interface ApiResponse<T = unknown> {
    status: number
    message: string
    data: T
}

export class ApiError extends Error {
    status: number
    data: unknown

    constructor(message: string, status: number, data: unknown = null) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.data = data
    }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
    body?: BodyInit | object | null
    auth?: boolean
    responseType?: 'json' | 'blob'
}

const parseResponse = async <T>(response: Response, responseType: 'json' | 'blob') => {
    if (responseType === 'blob') return await response.blob() as T
    const text = await response.text()
    if (!text) return null as T
    try { return JSON.parse(text) as ApiResponse<T> } catch { throw new ApiError('服务器返回格式无效', response.status) }
}

const request = async <T = unknown>(url: string, options: RequestOptions = {}): Promise<T> => {
    const { auth = true, responseType = 'json', body, headers: inputHeaders, ...init } = options
    const headers = new Headers(inputHeaders)
    const authData = useAuth().getAuthToken()
    if (auth && authData?.token) headers.set('Authorization', `Bearer ${authData.token}`)
    if (body && !(body instanceof FormData) && typeof body === 'object' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }
    const requestBody = body && !(body instanceof FormData) && typeof body === 'object' ? JSON.stringify(body) : body
    let response: Response
    try {
        response = await fetch(url, { ...init, headers, body: requestBody as BodyInit | null | undefined })
    } catch (error) {
        throw new ApiError(error instanceof Error ? error.message : '请求发送失败', 0)
    }
    if (response.status === 401 && auth) {
        useAuth().clearAuth()
        await router.push({ name: 'Login' })
        throw new ApiError('登录状态无效，请重新登录', 401)
    }
    const parsed = await parseResponse<T>(response, responseType)
    if (responseType === 'blob') {
        if (!response.ok) throw new ApiError('文件下载失败', response.status)
        return parsed as T
    }
    const result = parsed as ApiResponse<T> | null
    if (!response.ok || !result || result.status >= 400) {
        throw new ApiError(result?.message || `请求失败（${response.status}）`, response.status, result?.data)
    }
    return result.data
}

export const api = {
    get: <T = unknown>(url: string, options: RequestOptions = {}) => request<T>(url, { ...options, method: 'GET' }),
    post: <T = unknown>(url: string, body?: RequestOptions['body'], options: RequestOptions = {}) => request<T>(url, { ...options, method: 'POST', body }),
    put: <T = unknown>(url: string, body?: RequestOptions['body'], options: RequestOptions = {}) => request<T>(url, { ...options, method: 'PUT', body }),
    delete: <T = unknown>(url: string, options: RequestOptions = {}) => request<T>(url, { ...options, method: 'DELETE' }),
    upload: <T = unknown>(url: string, formData: FormData, options: RequestOptions = {}) => request<T>(url, { ...options, method: 'POST', body: formData }),
    blob: (url: string, options: RequestOptions = {}) => request<Blob>(url, { ...options, responseType: 'blob' }),
    download: async (url: string, options: RequestOptions = {}) => {
        const { responseType: _responseType, auth: _auth, body: _body, ...downloadOptions } = options
        const headers = new Headers(downloadOptions.headers)
        const authData = useAuth().getAuthToken()
        if (options.auth !== false && authData?.token) headers.set('Authorization', `Bearer ${authData.token}`)
        const response = await fetch(url, { ...downloadOptions, headers, method: options.method || 'GET', body: _body as BodyInit | null | undefined })
        if (response.status === 401 && options.auth !== false) {
            useAuth().clearAuth()
            await router.push({ name: 'Login' })
            throw new ApiError('登录状态无效，请重新登录', 401)
        }
        if (!response.ok) throw new ApiError('文件下载失败', response.status)
        return { blob: await response.blob(), headers: response.headers }
    }
}

export const publicApi = {
    post: <T = unknown>(url: string, body?: RequestOptions['body'], options: RequestOptions = {}) => request<T>(url, { ...options, auth: false, method: 'POST', body })
}

export default api
