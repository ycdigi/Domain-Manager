import type { Env } from '../../types'
import { verifyToken } from '../../utils/auth'

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        // 验证权限
        const authResult = await verifyToken(context)
        if (!authResult.success) {
            return Response.json({
                status: 401,
                message: authResult.message || '未授权访问',
                data: null
            }, { status: 401 })
        }

        // 获取所有域名数据，排除 ID 字段
        const { results } = await context.env.DB.prepare(
            `SELECT domains.domain, domains.registrar, domains.registrar_link, domains.registrar_date,
                    domains.expiry_date, domains.service_type, domains.status, domains.memo,
                    domains.tgsend, domains.st_tgsend, domains.adsense_connected,
                    domains.adsense_opened_date, domains.seo_last_date, domains.daily_clicks,
                    domains.clicks_updated_date,
                    adsense_accounts.name AS adsense_account,
                    domains.id AS domain_id
             FROM domains
             LEFT JOIN adsense_accounts ON adsense_accounts.id = domains.adsense_account_id`
        ).all()

        const { results: resourceRows } = await context.env.DB.prepare(`
            SELECT dr.domain_id, r.provider, a.name AS account, r.name AS resource, r.resource_url,
                   r.identifier, r.ip_address, r.port, r.region, r.status AS resource_status, dr.role
            FROM domain_resources dr
            JOIN provider_resources r ON r.id = dr.resource_id
            LEFT JOIN provider_accounts a ON a.id = r.account_id
            ORDER BY dr.domain_id, r.provider, r.name
        `).all()
        const grouped = new Map<number, unknown[]>()
        for (const resource of resourceRows || []) {
            const item = resource as { domain_id: number }
            const list = grouped.get(item.domain_id) || []
            const { domain_id, ...link } = item as any
            list.push(link)
            grouped.set(domain_id, list)
        }
        const enriched = (results || []).map((row: any) => {
            const { domain_id, ...exportRow } = row
            return { ...exportRow, resources: grouped.get(domain_id) || [] }
        })

        // 返回 JSON 文件，直接输出 domains 数组
        return new Response(JSON.stringify(enriched, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="domains-export-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}.json"`
            }
        })
    } catch (error) {
        console.error('导出数据失败:', error)
        return Response.json({
            status: 500,
            message: '导出数据失败: ' + (error as Error).message,
            data: null
        }, { status: 500 })
    }
}
