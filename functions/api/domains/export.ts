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
                    domains.site_name, domains.industry,
                    domains.tgsend, domains.st_tgsend, domains.adsense_connected,
                    domains.adsense_opened_date, domains.seo_last_date, domains.daily_clicks, domains.daily_clicks_range,
                    domains.clicks_updated_date, domains.platform, domains.platform_other,
                    domains.wp_calculator_count, domains.wp_article_count, domains.content_stats_updated_date,
                    (SELECT MAX(o.operation_date) FROM domain_operations o WHERE o.domain_id = domains.id) AS latest_operation_date,
                    (SELECT COUNT(*) FROM domain_operations o WHERE o.domain_id = domains.id) AS operation_count,
                    adsense_accounts.name AS adsense_account, adsense_accounts.owner AS adsense_owner,
                    adsense_accounts.publisher_id AS adsense_publisher_id,
                    domains.id AS domain_id
             FROM domains
             LEFT JOIN adsense_accounts ON adsense_accounts.id = domains.adsense_account_id`
        ).all()

        const { results: resourceRows } = await context.env.DB.prepare(`
            SELECT dr.domain_id, r.provider, a.name AS account, a.login_email, r.name AS resource, r.resource_url,
                   r.identifier, r.ip_address, r.port, r.region, r.status AS resource_status, dr.role, dr.is_primary
            FROM domain_resources dr
            JOIN provider_resources r ON r.id = dr.resource_id
            LEFT JOIN provider_accounts a ON a.id = r.account_id
            ORDER BY dr.domain_id, r.provider, r.name
        `).all()
        const { results: noteRows } = await context.env.DB.prepare(`
            SELECT domain_id, kind, content
            FROM domain_ai_notes
            WHERE archived_at IS NULL
            ORDER BY domain_id, kind, updated_at DESC, id DESC
        `).all()
        const { results: operationRows } = await context.env.DB.prepare(`
            SELECT domain_id, operation_date, operation_kind
            FROM domain_operations
            ORDER BY domain_id, operation_date DESC, id DESC
        `).all()
        const grouped = new Map<number, unknown[]>()
        const notesByDomain = new Map<number, unknown[]>()
        const operationsByDomain = new Map<number, unknown[]>()
        for (const resource of resourceRows || []) {
            const item = resource as { domain_id: number }
            const list = grouped.get(item.domain_id) || []
            const { domain_id, ...link } = item as any
            list.push(link)
            grouped.set(domain_id, list)
        }
        for (const note of noteRows || []) {
            const item = note as { domain_id: number; kind: string; content: string }
            const list = notesByDomain.get(item.domain_id) || []
            list.push({ kind: item.kind, content: item.content })
            notesByDomain.set(item.domain_id, list)
        }
        for (const operation of operationRows || []) {
            const item = operation as { domain_id: number; operation_date: string; operation_kind: string }
            const list = operationsByDomain.get(item.domain_id) || []
            list.push({ operation_date: item.operation_date, operation_kind: item.operation_kind })
            operationsByDomain.set(item.domain_id, list)
        }
        const enriched = (results || []).map((row: any) => {
            const { domain_id, ...exportRow } = row
            return { ...exportRow, resources: grouped.get(domain_id) || [], ai_notes: notesByDomain.get(domain_id) || [], operations: operationsByDomain.get(domain_id) || [] }
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
