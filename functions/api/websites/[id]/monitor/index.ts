import { getMonitorDetail, MonitorError, patchMonitor } from '../../../../domain/monitor'
import { monitorApi, monitorId } from '../../../../utils/monitor-api'
export const onRequestGet = monitorApi(context => getMonitorDetail(context.env.DB, monitorId(context.params.id)))
export const onRequestPatch = monitorApi(async context => {
    const body = await context.request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MonitorError('监控配置格式无效')
    return patchMonitor(context.env.DB, monitorId(context.params.id), body as Record<string, unknown>)
})
