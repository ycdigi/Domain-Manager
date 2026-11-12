import { checkOne, getMonitorDetail } from '../../../../domain/monitor'
import { monitorApi, monitorId } from '../../../../utils/monitor-api'
export const onRequestPost = monitorApi(async context => {
    const id = monitorId(context.params.id)
    await checkOne(context.env.DB, id)
    return getMonitorDetail(context.env.DB, id)
})
