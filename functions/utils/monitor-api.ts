import type { Env } from '../types'
import { checkAuth } from './auth'
import { MonitorError } from '../domain/monitor'

export const monitorApi = (handler: (context: EventContext<Env, string, unknown>) => Promise<unknown>): PagesFunction<Env> => async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        return Response.json({ status: 200, message: '成功', data: await handler(context) })
    } catch (error) {
        const status = error instanceof MonitorError ? error.status : error instanceof SyntaxError ? 400 : 500
        return Response.json({ status, message: error instanceof Error ? error.message : '监控请求失败', data: null }, { status })
    }
}
export const monitorId = (value: unknown) => {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) throw new MonitorError('网站或告警 ID 无效')
    return id
}
