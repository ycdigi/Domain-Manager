import { runFaviconTick } from '../functions/domain/favicons'
import { runMonitorTick } from '../functions/domain/monitor'

type MonitorEnv = { DB: D1Database; MONITOR_ENABLED?: string }
export default {
    async scheduled(_event: ScheduledController, env: MonitorEnv) {
        if (env.MONITOR_ENABLED !== 'true') return
        await Promise.all([runMonitorTick(env.DB), runFaviconTick(env.DB)])
    }
}
