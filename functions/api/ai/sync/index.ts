import type { Env } from '../../../types'
import { checkApiToken } from '../../../utils/auth'
import { normalizeDomain } from '../../../utils/domain-validation'
import { syncWebsiteTasks, reviewIsDue } from '../../../domain/website-task-transitions'
import { WebsiteEditError } from '../../../domain/website-edits'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkApiToken(context); if (authError) return authError
    const params = new URL(context.request.url).searchParams
    const websiteId = Number(params.get('website_id'))
    const domain = params.get('domain')
    if ((params.has('website_id') && params.has('domain')) || (!params.has('website_id') && !domain)) return json(null, 400, '请提供 website_id 或 domain 其中一项')
    try {
        if (params.has('website_id') && (!Number.isInteger(websiteId) || websiteId < 1)) return json(null, 400, 'website_id 必须是正整数')
        const site = params.has('website_id')
            ? await context.env.DB.prepare('SELECT id FROM websites WHERE id=?').bind(websiteId).first<{ id: number }>()
            : await context.env.DB.prepare("SELECT website_id AS id FROM domains WHERE lower(rtrim(domain, '.'))=? AND website_id IS NOT NULL").bind(normalizeDomain(String(domain))).first<{ id: number }>()
        if (!site?.id) return json(null, 404, params.has('website_id') ? '网站不存在' : '该域名未关联网站')
        const website = await context.env.DB.prepare(`SELECT w.*, a.name AS adsense_account_name,
            (SELECT json_group_array(json_object('id', d.id, 'domain', d.domain, 'is_primary', d.is_primary)) FROM domains d WHERE d.website_id=w.id) AS domains_json
            FROM websites w LEFT JOIN adsense_accounts a ON a.id=w.adsense_account_id WHERE w.id=?`).bind(site.id).first<Record<string, unknown>>()
        if (!website) return json(null, 404, '网站不存在')
        const tasks = await context.env.DB.prepare(`SELECT t.*, parent.title AS seo_task_title, parent.completion_summary AS seo_task_summary,
            (SELECT json_group_array(json_object('period_kind', s.period_kind, 'period_start', s.period_start, 'period_end', s.period_end, 'clicks', s.clicks)) FROM website_click_snapshots s WHERE s.task_id=t.id) AS snapshots_json
            FROM website_tasks t LEFT JOIN website_tasks parent ON parent.id=t.review_of_task_id
            WHERE t.website_id=? AND t.status <> '已完成' ORDER BY COALESCE(t.due_at, t.created_at), t.id`).bind(site.id).all<Record<string, unknown>>()

        const { domains_json: domainsJson, ...websiteData } = website
        const parsedWebsite = { ...websiteData, industry: websiteData.industry, domains: JSON.parse(String(domainsJson || '[]')) }
        return json({ website: parsedWebsite, tasks: (tasks.results || []).map(task => ({ ...task, review_due: task.task_type === 'SEO复查' && reviewIsDue(task.due_at), snapshots: JSON.parse(String(task.snapshots_json || '[]')) })) })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 AI 同步上下文失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkApiToken(context); if (authError) return authError
    try {
        const size = Number(context.request.headers.get('content-length') || 0)
        if (size > 200_000) return json(null, 413, 'AI 同步请求不能超过 200 KB')
        const result = await syncWebsiteTasks(context.env.DB, await context.request.json())
        return json(result.data, result.status, result.message)
    } catch (error) { return json(null, error instanceof WebsiteEditError ? error.status : 500, error instanceof Error ? error.message : 'AI 同步失败') }
}
