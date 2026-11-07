import type { D1Database } from '@cloudflare/workers-types'
import { isValidDate } from '../utils/domain-validation'

export const taskTypes = ['SEO', '内容', '技术', '其他'] as const
export type TaskType = typeof taskTypes[number]
export const taskStatuses = ['待做', '处理中', '已完成'] as const
export type TaskStatus = typeof taskStatuses[number]

export const addDays = (dateText: string, days: number) => {
    const date = new Date(`${dateText}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

export const validateWindow = (snapshot: { period_start?: unknown; period_end?: unknown; clicks?: unknown }, days: number) => {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return '点击快照格式无效'
    if (!isValidDate(snapshot.period_start) || !isValidDate(snapshot.period_end) || !Number.isInteger(snapshot.clicks) || Number(snapshot.clicks) < 0) return '点击快照格式无效'
    const length = (Date.parse(`${snapshot.period_end}T00:00:00Z`) - Date.parse(`${snapshot.period_start}T00:00:00Z`)) / 86_400_000 + 1
    return length === days ? null : `点击快照必须覆盖 ${days} 天`
}

export const websiteExists = async (db: D1Database, id: number) => Boolean(await db.prepare('SELECT id FROM websites WHERE id=?').bind(id).first())

export const insertSnapshot = (db: D1Database, taskId: number, kind: 'before' | 'after', snapshot: { period_start: string; period_end: string; clicks: number }) => db.prepare(`
    INSERT INTO website_click_snapshots (task_id, period_kind, period_start, period_end, clicks)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(task_id, period_kind) DO UPDATE SET period_start=excluded.period_start, period_end=excluded.period_end, clicks=excluded.clicks
`).bind(taskId, kind, snapshot.period_start, snapshot.period_end, snapshot.clicks)

export const ensureSeoReview = async (db: D1Database, task: { id: number; website_id: number; title: string; completed_at?: string | null; review_delay_days?: number; review_window_days?: number }) => {
    const completedAt = String(task.completed_at || new Date().toISOString().slice(0, 10)).slice(0, 10)
    const delay = Number(task.review_delay_days || 28)
    await db.batch([
        db.prepare(`INSERT OR IGNORE INTO website_tasks (website_id, task_type, title, description, status, due_at, review_of_task_id, review_window_days, baseline_missing)
            VALUES (?, 'SEO复查', ?, ?, '待跟进', ?, ?, ?, 1)`)
            .bind(task.website_id, `复查：${task.title}`, `复查 SEO 修改效果：${task.title}`, addDays(completedAt, delay), task.id, task.review_window_days || 28),
        db.prepare(`INSERT OR IGNORE INTO website_click_snapshots (task_id, period_kind, period_start, period_end, clicks)
            SELECT r.id, 'before', s.period_start, s.period_end, s.clicks FROM website_tasks r
            JOIN website_click_snapshots s ON s.task_id=? AND s.period_kind='before' WHERE r.review_of_task_id=?`).bind(task.id, task.id),
        db.prepare("DELETE FROM website_click_snapshots WHERE task_id=? AND period_kind='before'").bind(task.id),
        db.prepare(`UPDATE website_tasks SET baseline_missing=CASE WHEN EXISTS (
            SELECT 1 FROM website_click_snapshots s JOIN website_tasks r ON r.id=s.task_id
            WHERE r.review_of_task_id=? AND s.period_kind='before') THEN 0 ELSE 1 END
            WHERE id=? OR review_of_task_id=?`).bind(task.id, task.id, task.id)
    ])
    return (await db.prepare('SELECT id FROM website_tasks WHERE review_of_task_id=?').bind(task.id).first<{ id: number }>())?.id
}
