import { Env } from './types'
import { checkApiToken } from './utils/auth'

export const onRequest: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url)

        if (context.request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
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
            return response
        }

        // 如果是 OPTIONS 请求，返回 CORS 头
        if (context.request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            })
        }

        // 如果是静态资源请求，直接返回资源
        if (url.pathname.startsWith('/assets/')) {
            return await context.env.ASSETS.fetch(context.request)
        }

        // 对于所有其他请求，返回 index.html
        const response = await context.env.ASSETS.fetch(new Request(`${url.origin}/index.html`))
        const headers = new Headers(response.headers)
        headers.set('Cache-Control', 'no-cache')

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
