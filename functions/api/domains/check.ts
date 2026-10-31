import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { checkSiteOnline } from '../../utils/site-check'

const isDomain = (value: unknown): value is string => typeof value === 'string' && /^(?=.{3,255}$)[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/.test(value)

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context)
    if (authError) return authError
    try {
        const body = await context.request.json() as { domain?: unknown }
        if (!isDomain(body.domain)) return Response.json({ status: 400, message: '域名格式无效', data: null }, { status: 400 })
        const online = await checkSiteOnline(body.domain)
        return Response.json({ status: 200, message: '检查完成', data: { status: online ? '在线' : '离线' } })
    } catch (error) {
        return Response.json({ status: 400, message: error instanceof Error ? '检查请求格式无效' : '检查失败', data: null }, { status: 400 })
    }
}
