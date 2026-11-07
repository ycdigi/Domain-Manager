import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { onRequestGet as getSnapshot } from '../export/snapshot/index'

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const response = await context.env.DB.prepare('SELECT 1').first()
        if (!response) throw new Error('数据库不可用')
        const routes = await getSnapshot(context)
        if (!routes.ok) return routes
        const payload = await routes.json() as { data?: unknown }
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        return new Response(JSON.stringify(payload.data ?? payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="website-portfolio-${date}.json"` } })
    } catch (error) {
        console.error('网站组合导出失败:', error)
        return Response.json({ status: 500, message: error instanceof Error ? error.message : '网站组合导出失败', data: null }, { status: 500 })
    }
}
