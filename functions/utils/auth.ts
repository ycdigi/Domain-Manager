import { Env } from '../types'

export interface AuthResult {
    success: boolean;
    message?: string;
    userId?: string;
}

const encoder = new TextEncoder()
const encodeBase64Url = (bytes: Uint8Array) => {
    let binary = ''
    bytes.forEach(byte => { binary += String.fromCharCode(byte) })
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
const decodeBase64Url = (value: string) => {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

const sessionKey = (secret: string) => crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
)

export const issueSessionToken = async (username: string, secret: string) => {
    const payload = encodeBase64Url(encoder.encode(JSON.stringify({ sub: username, nonce: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))) })))
    const signature = await crypto.subtle.sign('HMAC', await sessionKey(secret), encoder.encode(payload))
    return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export const verifyToken = async (context: EventContext<Env, any, any>): Promise<AuthResult> => {
    const authHeader = context.request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra || !context.env.PASS || !context.env.USER) return { success: false, message: '未授权访问' }
    try {
        const valid = await crypto.subtle.verify('HMAC', await sessionKey(context.env.PASS), decodeBase64Url(signature), encoder.encode(payload))
        if (!valid) return { success: false, message: '登录状态无效' }
        const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { sub?: string; nonce?: string }
        if (claims.sub !== context.env.USER || !claims.nonce) return { success: false, message: '登录状态无效' }
        return { success: true, userId: claims.sub }
    } catch {
        return { success: false, message: '登录状态无效' }
    }
}

export const checkAuth = async (context: EventContext<Env, any, any>) => {
    const result = await verifyToken(context)
    if (!result.success) {
        return new Response(JSON.stringify({
            status: 401,
            message: result.message || '未授权访问',
            data: null
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        })
    }
    return null
}

export const checkApiToken = async (context: EventContext<Env, any, any>) => {
    const authHeader = context.request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''

    if (!token || !context.env.API_TOKEN || token !== context.env.API_TOKEN) {
        return new Response(JSON.stringify({
            status: 401,
            message: '无效的访问令牌',
            data: null
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        })
    }
    return null
}
