import { MonitorError } from '../../../../domain/monitor'
import { monitorApi, monitorId } from '../../../../utils/monitor-api'
export const onRequestPost = monitorApi(async context => {
    const result = await context.env.DB.prepare('UPDATE website_monitor_incidents SET read_at=COALESCE(read_at,?) WHERE id=?')
        .bind(new Date().toISOString(), monitorId(context.params.id)).run()
    if (!result.meta.changes) throw new MonitorError('告警不存在', 404)
    return null
})
