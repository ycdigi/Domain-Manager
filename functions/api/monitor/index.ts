import { getMonitorOverview } from '../../domain/monitor'
import { monitorApi } from '../../utils/monitor-api'
export const onRequestGet = monitorApi(context => getMonitorOverview(context.env.DB))
