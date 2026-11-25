import { isValidDate, todayShanghaiDate } from '../utils/domain-validation'
import { addDays, seoReviewWrites, taskStatuses, validateWindow, insertSnapshot } from './website-tasks'
import { prepareWebsiteEdit, websiteEditWrite } from './website-edits'
const result = (data: unknown, status = 200, message = '成功') => ({ data, status, message })
const allowed = new Set(['title', 'description', 'status', 'due_at', 'completed_at', 'completion_summary', 'result_url', 'review_delay_days', 'review_window_days'])

export const editWebsiteTask = async (db: D1Database, id: number, taskId: number, body: Record<string, unknown>) => {
    const entries = Object.entries(body)
    if (!entries.length || entries.some(([key]) => !allowed.has(key))) return result(null, 400, '任务更新包含不支持的字段')
    if (body.status !== undefined && !taskStatuses.includes(body.status as typeof taskStatuses[number])) return result(null, 400, '任务状态无效')
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200)) return result(null, 400, '任务标题必填且不能超过 200 个字符')
    if (body.description != null && (typeof body.description !== 'string' || body.description.length > 5000)) return result(null, 400, '任务描述不能超过 5000 个字符')
    if (body.completion_summary != null && (typeof body.completion_summary !== 'string' || body.completion_summary.length > 5000)) return result(null, 400, '完成摘要不能超过 5000 个字符')
    if (body.result_url != null) {
        try { const url = new URL(String(body.result_url)); if (!['http:', 'https:'].includes(url.protocol) || String(body.result_url).length > 2000) return result(null, 400, '结果链接必须是 HTTP 或 HTTPS 地址') }
        catch { return result(null, 400, '结果链接必须是 HTTP 或 HTTPS 地址') }
    }
    if (body.review_delay_days !== undefined && (!Number.isInteger(body.review_delay_days) || Number(body.review_delay_days) < 28 || Number(body.review_delay_days) > 3650)) return result(null, 400, '复查等待天数必须为 28 到 3650 天')
    if (body.review_window_days !== undefined && (!Number.isInteger(body.review_window_days) || Number(body.review_window_days) < 1 || Number(body.review_window_days) > 365)) return result(null, 400, '点击窗口必须为 1 到 365 天')
    for (const key of ['due_at', 'completed_at']) if (body[key] != null && !isValidDate(body[key])) return result(null, 400, '任务日期无效')
    const current = await db.prepare('SELECT * FROM website_tasks WHERE id=? AND website_id=?').bind(taskId, id).first<Record<string, unknown>>()
    if (!current) return result(null, 404, '任务不存在')
    if (current.task_type === 'SEO复查' && body.status !== undefined) return result(null, 400, '复查任务状态由实际点击数据和复查结论控制')
    if (current.task_type === 'SEO' && Number(body.review_delay_days ?? current.review_delay_days) < Number(body.review_window_days ?? current.review_window_days)) return result(null, 400, '等待天数不能短于修改后点击窗口')
    if (body.completed_at != null && String(body.completed_at) > todayShanghaiDate()) return result(null, 400, '完成日期不能在未来')
    if (current.task_type === 'SEO复查' && body.due_at !== undefined) {
        const parent = await db.prepare('SELECT completed_at, review_delay_days FROM website_tasks WHERE id=? AND website_id=?').bind(current.review_of_task_id, id).first<{ completed_at: string; review_delay_days: number }>()
        if (!parent || !isValidDate(body.due_at) || body.due_at < addDays(parent.completed_at, Math.max(28, parent.review_delay_days))) return result(null, 400, '复查日期不能早于 SEO 完成后的等待期')
    }
    if (body.review_window_days !== undefined) {
        const snapshots = await db.prepare('SELECT period_start, period_end, clicks FROM website_click_snapshots WHERE task_id=?').bind(taskId).all<{ period_start: string; period_end: string; clicks: number }>()
        if ((snapshots.results || []).some(snapshot => validateWindow(snapshot, Number(body.review_window_days)))) return result(null, 400, '已有快照与新的对比窗口长度不一致')
    }
    if (current.task_type === 'SEO' && current.completed_at && ['completed_at', 'review_delay_days', 'review_window_days'].some(key => body[key] !== undefined && body[key] !== current[key])) return result(null, 400, 'SEO 完成后的复查基准已固定，请在复查任务调整日期')
    const changes = entries.map(([key, value]) => [key, value === '' ? null : value] as const)
    if (body.status === '已完成' && !body.completed_at && !current.completed_at) changes.push(['completed_at', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())])
    changes.push(['updated_at', new Date().toISOString()])
    const statements = [db.prepare(`UPDATE website_tasks SET ${changes.map(([key]) => `${key}=?`).join(', ')} WHERE id=? AND website_id=? RETURNING *`).bind(...changes.map(([, value]) => value), taskId, id)]
    if (current.task_type === 'SEO' && (body.status === '已完成' || body.status === undefined && current.status === '已完成')) statements.push(...seoReviewWrites(db, taskId))
    const applied = await db.batch(statements)
    const updated = applied[0].results?.[0]
    return result(updated, 200, '任务已更新')
}

const conclusions = ['提升', '持平', '下降', '数据不足']
const statuses = ['待做', '处理中', '已完成']

interface Snapshot { period_start: string; period_end: string; clicks: number }

export const reviewIsDue = (dueAt: unknown) => typeof dueAt === 'string' && isValidDate(dueAt) && dueAt <= todayShanghaiDate()

export const syncWebsiteTasks = async (db: D1Database, body: { website_id?: number; fields?: Record<string, unknown>; task_updates?: Array<Record<string, unknown>> }) => {
    if (Object.keys(body || {}).some(key => !['website_id', 'fields', 'task_updates'].includes(key))) return result(null, 400, 'AI 同步请求包含不支持的字段')
    const websiteId = Number(body?.website_id)
    if (!Number.isInteger(websiteId) || websiteId < 1) return result(null, 400, 'website_id 是必填的正整数')
    const website = await db.prepare('SELECT * FROM websites WHERE id=?').bind(websiteId).first<Record<string, unknown>>()
    if (!website) return result(null, 404, '网站不存在')
    const fields = await prepareWebsiteEdit(db, body.fields ?? {}, 'ai', website)
    if (body.task_updates !== undefined && (!Array.isArray(body.task_updates) || body.task_updates.length > 50)) return result(null, 400, 'task_updates 最多支持 50 项')
    const updates = body.task_updates || []
    const skipped: number[] = []
    const baselineTargets = new Map<number, number>()
    for (const item of updates) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return result(null, 400, 'task_updates 项目格式无效')
        if (Object.keys(item).some(key => !['task_id', 'status', 'completion_summary', 'result_url', 'baseline', 'review'].includes(key))) return result(null, 400, '任务更新包含不支持的字段')
        const existingTask = Number.isInteger(item.task_id) ? await db.prepare('SELECT id, task_type, review_window_days FROM website_tasks WHERE id=? AND website_id=?').bind(item.task_id, websiteId).first<{ id: number; task_type: string; review_window_days: number }>() : null
        if (!existingTask) return result(null, 404, `找不到网站内任务 ${String(item.task_id)}`)
        if (item.status !== undefined && !statuses.includes(String(item.status))) return result(null, 400, 'AI 只能将任务设置为待做、处理中或已完成')
        if (existingTask.task_type === 'SEO复查' && item.status !== undefined) return result(null, 400, '复查任务状态由实际点击数据和复查结论控制')
        if (item.baseline !== undefined) {
            if (existingTask.task_type !== 'SEO') return result(null, 400, '只有 SEO 任务可以回写修改前点击基线')
            const review = await db.prepare('SELECT id, status, review_window_days FROM website_tasks WHERE review_of_task_id=? AND website_id=?').bind(item.task_id, websiteId).first<{id: number; status: string; review_window_days: number}>()
            const targetId = review?.id ?? existingTask.id
            const validation = validateWindow(item.baseline as Snapshot, review?.review_window_days ?? existingTask.review_window_days)
            if (validation) return result(null, 400, validation)
            if (review?.status === '已完成') {
                const before = await db.prepare("SELECT period_start, period_end, clicks FROM website_click_snapshots WHERE task_id=? AND period_kind='before'").bind(targetId).first<Snapshot>()
                const baseline = item.baseline as Snapshot
                if (!before || before.period_start !== baseline.period_start || before.period_end !== baseline.period_end || before.clicks !== baseline.clicks) return result(null, 400, '复查已完成，请先重新打开复查再更改基线')
            }
            baselineTargets.set(Number(item.task_id), targetId)
        }
        if (item.completion_summary != null && (typeof item.completion_summary !== 'string' || item.completion_summary.length > 5000)) return result(null, 400, '完成摘要不能超过 5000 个字符')
        if (item.result_url != null) {
            try { const url = new URL(String(item.result_url)); if (!['http:', 'https:'].includes(url.protocol) || String(item.result_url).length > 2000) return result(null, 400, 'result_url 必须是 HTTP 或 HTTPS 地址') }
            catch { return result(null, 400, 'result_url 必须是 HTTP 或 HTTPS 地址') }
        }
        if (item.review !== undefined) {
            const task = await db.prepare('SELECT task_type, due_at, review_window_days, review_of_task_id FROM website_tasks WHERE id=? AND website_id=?').bind(item.task_id, websiteId).first<{ task_type: string; due_at: string | null; review_window_days: number; review_of_task_id: number | null }>()
            if (task?.task_type !== 'SEO复查') return result(null, 400, '只有 SEO 复查任务可以提交 review')
            if (!reviewIsDue(task.due_at)) { skipped.push(Number(item.task_id)); continue }
            const review = item.review as Record<string, unknown>
            if (!review || typeof review !== 'object' || Array.isArray(review)) return result(null, 400, 'review 必须是对象')
            if (review.conclusion !== undefined && !conclusions.includes(String(review.conclusion))) return result(null, 400, '复查结论无效')
            if (review.basis != null && (typeof review.basis !== 'string' || review.basis.length > 5000)) return result(null, 400, '复查依据不能超过 5000 个字符')
            if (review.conclusion !== undefined && (typeof review.basis !== 'string' || !review.basis.trim())) return result(null, 400, '复查结论必须有简短依据')
            const suppliedBaseline = updates.find(update => update?.task_id === task.review_of_task_id && update.baseline !== undefined)?.baseline as Snapshot | undefined
            const before = suppliedBaseline ?? await db.prepare("SELECT period_start, period_end, clicks FROM website_click_snapshots WHERE task_id=? AND period_kind='before'").bind(item.task_id).first<Snapshot>()
            if (review.conclusion !== undefined && review.conclusion !== '数据不足' && (!before || validateWindow(before, task.review_window_days))) return result(null, 400, '缺少可比基线时只能记录数据不足')
            if (review.after !== undefined) {
                const error = validateWindow(review.after as Snapshot, task.review_window_days)
                if (error) return result(null, 400, error)
                const after = review.after as Snapshot
                if (after.period_end !== task.due_at || after.period_start !== addDays(String(task.due_at), 1 - task.review_window_days)) return result(null, 400, '复查窗口必须覆盖截止日之前的完整设定天数')
            }
            if (review.after !== undefined && review.conclusion === undefined) return result(null, 400, '提供复查数据时必须提供 AI 判断')
            if (review.after === undefined && review.conclusion !== undefined && review.conclusion !== '数据不足') return result(null, 400, '缺少复查数据时不能判断提升、持平或下降')
        }
    }
    const fieldEntries = Object.entries(fields)
    if (!fieldEntries.length && !updates.length) return result(null, 400, '没有可同步的变化')
    const statements: D1PreparedStatement[] = []
    if (fieldEntries.length) statements.push(websiteEditWrite(db, websiteId, fields))
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
            statements.push(insertSnapshot(db, baselineTargets.get(Number(item.task_id))!, 'before', item.baseline as Snapshot))
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
    for (const item of updates) {
        if (item.status === '已完成' || item.baseline !== undefined) statements.push(...seoReviewWrites(db, Number(item.task_id)))
    }
    if (statements.length) await db.batch(statements)
    if (skipped.length && !fieldEntries.length && appliedTasks.length === 0) return result({ applied: { fields: [], tasks: [] }, skipped: { review_not_due: skipped } }, 409, '复查尚未到期，未更新效果结论')
    return result({ website_id: websiteId, applied: { fields: fieldEntries.map(([key]) => key), tasks: appliedTasks }, skipped: { review_not_due: skipped } }, 200, 'AI 同步完成')
}
