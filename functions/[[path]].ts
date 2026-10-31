import { Env } from './types'
import { checkApiToken } from './utils/auth'

const applySecurityHeaders = (headers: Headers, isApi = false) => {
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (isApi) headers.set('Cache-Control', 'no-store')
}

export const onRequest: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url)

        if (context.request.method === 'OPTIONS') {
            const headers = new Headers({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            })
            applySecurityHeaders(headers, true)
            return new Response(null, {
                headers
            })
        }

        // 如果是 API 请求，继续处理
        if (url.pathname.startsWith('/api/')) {
            // 外部检查和 AI 同步接口使用 API_TOKEN
            if (url.pathname.startsWith('/api/check') || url.pathname.startsWith('/api/ai/')) {
                const authError = await checkApiToken(context)
                if (authError) return authError
            } else if (url.pathname !== '/api/login') {
                // 对于其他 API 请求，验证用户登录 token
                const authHeader = context.request.headers.get('Authorization')
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return new Response(JSON.stringify({
                        status: 401,
                        message: '未授权访问',
                        data: null
                    }), {
                        status: 401,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    })
                }
            }

            // 添加 CORS 头
            const response = await context.next()
            response.headers.set('Access-Control-Allow-Origin', '*')
            response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            applySecurityHeaders(response.headers, true)
            return response
        }

        // 如果是 OPTIONS 请求，返回 CORS 头
        if (context.request.method === 'OPTIONS') {
            const headers = new Headers({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            })
            applySecurityHeaders(headers, true)
            return new Response(null, {
                headers
            })
        }

        // 如果是静态资源请求，直接返回资源
        if (url.pathname.startsWith('/assets/')) {
            const response = await context.env.ASSETS.fetch(context.request)
            const headers = new Headers(response.headers)
            applySecurityHeaders(headers)
            return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
        }

        // 对于所有其他请求，返回 index.html
        const response = await context.env.ASSETS.fetch(new Request(`${url.origin}/index.html`))
        const headers = new Headers(response.headers)
        headers.set('Cache-Control', 'no-cache')
        applySecurityHeaders(headers)

        return new Response(response.body, {
            status: 200,
            headers
        })
    } catch (err) {
        const error = err as Error
        return new Response(JSON.stringify({
            status: 500,
            message: error.message || '未知错误',
            data: null
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        })
    }
}
