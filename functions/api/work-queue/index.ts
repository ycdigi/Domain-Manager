import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { getBatchDetail } from '../../domain/batches'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export const onRequestGet: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const date = today(); const db = context.env.DB; const items: Array<Record<string, unknown>> = []
        const monitors = await db.prepare(`SELECT m.website_id,w.name AS website_name,m.status,m.reason FROM website_monitors m JOIN websites w ON w.id=m.website_id WHERE w.lifecycle='active' AND m.status IN ('failure','review','incomplete') ORDER BY m.website_id`).all<Record<string, unknown>>()
        for (const row of monitors.results || []) items.push({ type: 'monitor', website_id: row.website_id, title: row.website_name, detail: row.reason || row.status })
        const actions = await db.prepare(`SELECT id,name,next_action,next_action_due_date FROM websites WHERE lifecycle='active' AND next_action_status<>'已完成' AND next_action_due_date IS NOT NULL AND next_action_due_date<? ORDER BY next_action_due_date,id`).bind(date).all<Record<string, unknown>>()
        for (const row of actions.results || []) items.push({ type: 'next_action', website_id: row.id, title: row.name, detail: row.next_action, due_date: row.next_action_due_date })
        const tasks = await db.prepare(`SELECT t.id,t.website_id,w.name AS website_name,t.title,t.status,t.due_at FROM website_tasks t JOIN websites w ON w.id=t.website_id WHERE t.status='待跟进' OR (t.task_type='SEO复查' AND t.status<>'已完成' AND t.due_at IS NOT NULL AND t.due_at<=?) ORDER BY COALESCE(t.due_at,'9999-12-31'),t.id`).bind(date).all<Record<string, unknown>>()
        for (const row of tasks.results || []) items.push({ type: 'task', website_id: row.website_id, task_id: row.id, title: row.website_name, detail: row.title, due_date: row.due_at })
        const batches = await db.prepare("SELECT id FROM website_batches WHERE status='待复盘' OR status='已复盘'").all<{ id: number }>()
        for (const row of batches.results || []) {
            const detail = await getBatchDetail(db, row.id)
            if (detail && (detail.status === '待复盘' || detail.review_changed)) items.push({ type: 'batch', batch_id: row.id, title: detail.name, detail: detail.status === '待复盘' ? '等待复盘' : '复盘数据已变化' })
        }
        const counts = { monitor: items.filter(item => item.type === 'monitor').length, next_action: items.filter(item => item.type === 'next_action').length, task: items.filter(item => item.type === 'task').length, batch: items.filter(item => item.type === 'batch').length, total: items.length }
        return json({ counts, items })
    } catch (error) { return json(null, 500, error instanceof Error ? error.message : '获取待处理事项失败') }
}
