import type { Env } from '../../../types'
import { checkApiToken } from '../../../utils/auth'
import { isValidDate, normalizeDomain, todayShanghaiDate } from '../../../utils/domain-validation'
import { addDays, ensureSeoReview, insertSnapshot, validateWindow } from '../../../domain/website-tasks'
import { isUnchangedLegacyIndustry, validateWebsiteFields } from '../../../domain/website-validation'
import { normalizeWebsiteIndustry } from '../../../../shared/website-classification'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const siteFields = new Set(['name', 'ownership', 'industry', 'platform', 'platform_other', 'adsense_account_id', 'adsense_connected', 'adsense_opened_date', 'gsc_connected', 'seo_last_date', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'potential'])
const conclusions = ['提升', '持平', '下降', '数据不足']
const statuses = ['待做', '处理中', '已完成']

interface Snapshot { period_start: string; period_end: string; clicks: number }

const reviewIsDue = (dueAt: unknown) => typeof dueAt === 'string' && isValidDate(dueAt) && dueAt <= todayShanghaiDate()

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
        const parsedWebsite = { ...websiteData, industry: normalizeWebsiteIndustry(websiteData.industry), domains: JSON.parse(String(domainsJson || '[]')) }
        return json({ website: parsedWebsite, tasks: (tasks.results || []).map(task => ({ ...task, review_due: task.task_type === 'SEO复查' && reviewIsDue(task.due_at), snapshots: JSON.parse(String(task.snapshots_json || '[]')) })) })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取 AI 同步上下文失败') }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkApiToken(context); if (authError) return authError
    try {
        const size = Number(context.request.headers.get('content-length') || 0)
        if (size > 200_000) return json(null, 413, 'AI 同步请求不能超过 200 KB')
        const body = await context.request.json() as { website_id?: unknown; fields?: Record<string, unknown>; task_updates?: Array<Record<string, unknown>> }
        const websiteId = Number(body?.website_id)
        if (!Number.isInteger(websiteId) || websiteId < 1) return json(null, 400, 'website_id 是必填的正整数')
        const db = context.env.DB
        const website = await db.prepare('SELECT * FROM websites WHERE id=?').bind(websiteId).first<Record<string, unknown>>()
        if (!website) return json(null, 404, '网站不存在')
        const fields = body.fields || {}
        if (typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).some(key => !siteFields.has(key))) return json(null, 400, 'fields 必须是受支持字段组成的对象')
        const fieldError = validateWebsiteFields(fields, website)
        if (fieldError) return json(null, 400, fieldError)
        if (fields.adsense_account_id != null && (!Number.isInteger(fields.adsense_account_id) || !await db.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(fields.adsense_account_id).first())) return json(null, 400, 'AdSense 账号不存在')
        if (body.task_updates !== undefined && (!Array.isArray(body.task_updates) || body.task_updates.length > 50)) return json(null, 400, 'task_updates 最多支持 50 项')

        const updates = body.task_updates || []
        const skipped: number[] = []
        for (const item of updates) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return json(null, 400, 'task_updates 项目格式无效')
            if (Object.keys(item).some(key => !['task_id', 'status', 'completion_summary', 'result_url', 'baseline', 'review'].includes(key))) return json(null, 400, '任务更新包含不支持的字段')
            const existingTask = Number.isInteger(item.task_id) ? await db.prepare('SELECT id, task_type, review_window_days FROM website_tasks WHERE id=? AND website_id=?').bind(item.task_id, websiteId).first<{ id: number; task_type: string; review_window_days: number }>() : null
            if (!existingTask) return json(null, 404, `找不到网站内任务 ${String(item.task_id)}`)
            if (item.status !== undefined && !statuses.includes(String(item.status))) return json(null, 400, 'AI 只能将任务设置为待做、处理中或已完成')
            if (existingTask.task_type === 'SEO复查' && item.status !== undefined) return json(null, 400, '复查任务状态由实际点击数据和复查结论控制')
            if (item.baseline !== undefined) {
                if (existingTask.task_type !== 'SEO') return json(null, 400, '只有 SEO 任务可以回写修改前点击基线')
                const validation = validateWindow(item.baseline as Snapshot, existingTask.review_window_days)
                if (validation) return json(null, 400, validation)
            }
            if (item.completion_summary != null && (typeof item.completion_summary !== 'string' || item.completion_summary.length > 5000)) return json(null, 400, '完成摘要不能超过 5000 个字符')
            if (item.result_url != null) {
                try { const url = new URL(String(item.result_url)); if (!['http:', 'https:'].includes(url.protocol) || String(item.result_url).length > 2000) return json(null, 400, 'result_url 必须是 HTTP 或 HTTPS 地址') }
                catch { return json(null, 400, 'result_url 必须是 HTTP 或 HTTPS 地址') }
            }
            if (item.review !== undefined) {
                const task = await db.prepare('SELECT task_type, due_at, review_window_days FROM website_tasks WHERE id=? AND website_id=?').bind(item.task_id, websiteId).first<{ task_type: string; due_at: string | null; review_window_days: number }>()
                if (task?.task_type !== 'SEO复查') return json(null, 400, '只有 SEO 复查任务可以提交 review')
                if (!reviewIsDue(task.due_at)) { skipped.push(Number(item.task_id)); continue }
                const review = item.review as Record<string, unknown>
                if (!review || typeof review !== 'object' || Array.isArray(review)) return json(null, 400, 'review 必须是对象')
                if (review.conclusion !== undefined && !conclusions.includes(String(review.conclusion))) return json(null, 400, '复查结论无效')
                if (review.basis != null && (typeof review.basis !== 'string' || review.basis.length > 5000)) return json(null, 400, '复查依据不能超过 5000 个字符')
                if (review.conclusion !== undefined && (typeof review.basis !== 'string' || !review.basis.trim())) return json(null, 400, '复查结论必须有简短依据')
                const before = await db.prepare("SELECT period_start, period_end, clicks FROM website_click_snapshots WHERE task_id=? AND period_kind='before'").bind(item.task_id).first<Snapshot>()
                if (review.conclusion !== undefined && review.conclusion !== '数据不足' && (!before || validateWindow(before, task.review_window_days))) return json(null, 400, '缺少可比基线时只能记录数据不足')
                if (review.after !== undefined) {
                    const error = validateWindow(review.after as Snapshot, task.review_window_days)
                    if (error) return json(null, 400, error)
                    const after = review.after as Snapshot
                    if (after.period_end !== task.due_at || after.period_start !== addDays(String(task.due_at), 1 - task.review_window_days)) return json(null, 400, '复查窗口必须覆盖截止日之前的完整设定天数')
                }
                if (review.after !== undefined && review.conclusion === undefined) return json(null, 400, '提供复查数据时必须提供 AI 判断')
                if (review.after === undefined && review.conclusion !== undefined && review.conclusion !== '数据不足') return json(null, 400, '缺少复查数据时不能判断提升、持平或下降')
            }
        }
        const fieldEntries = Object.entries(fields).filter(([key, value]) => !(key === 'industry' && isUnchangedLegacyIndustry(value, website.industry)))
        if (!fieldEntries.length && !updates.length) return json(null, 400, '没有可同步的变化')
        const statements: D1PreparedStatement[] = []
        if (fieldEntries.length) statements.push(db.prepare(`UPDATE websites SET ${fieldEntries.map(([key]) => `${key}=?`).join(', ')} WHERE id=?`).bind(...fieldEntries.map(([, value]) => value === '' ? null : value), websiteId))
        const appliedTasks: number[] = []
        for (const item of updates) {
            const task = await db.prepare('SELECT * FROM website_tasks WHERE id=? AND website_id=?').bind(item.task_id, websiteId).first<Record<string, unknown>>()
            if (!task) continue
            const patch: Array<[string, unknown]> = []
            for (const key of ['status', 'completion_summary', 'result_url'] as const) if (item[key] !== undefined) patch.push([key, item[key]])
            if (item.status === '已完成' && !task.completed_at) patch.push(['completed_at', todayShanghaiDate()])
            if (patch.length) {
                statements.push(db.prepare(`UPDATE website_tasks SET ${patch.map(([key]) => `${key}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND website_id=?`).bind(...patch.map(([, value]) => value), item.task_id, websiteId))
                appliedTasks.push(Number(item.task_id))
            }
            if (item.baseline !== undefined) {
                statements.push(insertSnapshot(db, Number(item.task_id), 'before', item.baseline as Snapshot))
                if (!appliedTasks.includes(Number(item.task_id))) appliedTasks.push(Number(item.task_id))
            }
            if (item.review !== undefined && !skipped.includes(Number(item.task_id))) {
                const review = item.review as Record<string, unknown>
                if (review.after) statements.push(insertSnapshot(db, Number(item.task_id), 'after', review.after as Snapshot))
                const nextStatus = review.after && review.conclusion ? '已完成' : '待跟进'
                statements.push(db.prepare(`UPDATE website_tasks SET status=?, review_conclusion=?, review_basis=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nextStatus, review.conclusion ?? null, review.basis ?? null, nextStatus === '已完成' ? todayShanghaiDate() : null, item.task_id))
                if (!appliedTasks.includes(Number(item.task_id))) appliedTasks.push(Number(item.task_id))
            }
        }
        if (statements.length) await db.batch(statements)
        for (const item of updates) {
            if (item.status !== '已完成' && item.baseline === undefined) continue
            const task = await db.prepare('SELECT id, website_id, title, task_type, completed_at, review_delay_days, review_window_days FROM website_tasks WHERE id=? AND website_id=?').bind(item.task_id, websiteId).first<{ id: number; website_id: number; title: string; task_type: string; completed_at: string | null; review_delay_days: number; review_window_days: number }>()
            if (task?.task_type === 'SEO' && task.completed_at) await ensureSeoReview(db, task)
        }
        if (skipped.length && !fieldEntries.length && appliedTasks.length === 0) return json({ applied: { fields: [], tasks: [] }, skipped: { review_not_due: skipped } }, 409, '复查尚未到期，未更新效果结论')
        return json({ website_id: websiteId, applied: { fields: fieldEntries.map(([key]) => key), tasks: appliedTasks }, skipped: { review_not_due: skipped } }, 200, 'AI 同步完成')
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : 'AI 同步失败') }
}
