import { checkWebsite, type MonitorCheckResult } from '../../shared/site-monitor'

export type MonitorState = {
    website_id: number; domain_id: number | null; domain: string | null; enabled: number
    required_text: string; forbidden_text: string; allowed_redirect_hosts: string; baseline_title: string | null
    status: string; reason: string | null; http_status: number | null; response_ms: number | null
    final_url: string | null; title: string | null; checked_at: string | null; next_check_at: string
    consecutive_failures: number; config_version: number; lease_token: string | null; lease_until: string | null
}
type JoinedMonitor = MonitorState & { website_name: string; lifecycle: string; stage: string }
type Options = { now?: string; checker?: typeof checkWebsite; automatic?: boolean }
export class MonitorError extends Error {
    constructor(message: string, public status = 400) { super(message) }
}
const isoAfter = (now: string, ms: number) => new Date(Date.parse(now) + ms).toISOString()
const effective = (row: JoinedMonitor) => Boolean(row.enabled && row.domain && row.lifecycle === 'active' && row.stage !== '暂停')
export const presentMonitor = (row: JoinedMonitor) => ({
    ...row, enabled: Boolean(row.enabled), effective_enabled: effective(row),
    status: effective(row) ? ['review', 'incomplete'].includes(row.status) ? 'unchecked' : row.status : 'disabled',
    reason: ['review', 'incomplete'].includes(row.status) ? null : row.reason,
    required_text: JSON.parse(row.required_text), forbidden_text: JSON.parse(row.forbidden_text), allowed_redirect_hosts: JSON.parse(row.allowed_redirect_hosts),
    lease_token: undefined, lease_until: undefined, config_version: undefined, lifecycle: undefined, stage: undefined
})

const selectMonitor = `SELECT m.*, w.name AS website_name,w.lifecycle,w.stage FROM website_monitors m JOIN websites w ON w.id=m.website_id`
export const getMonitorDetail = async (db: D1Database, id: number) => {
    const row = await db.prepare(`${selectMonitor} WHERE m.website_id=?`).bind(id).first<JoinedMonitor>()
    if (!row) throw new MonitorError('网站不存在', 404)
    const [history, incidents] = await Promise.all([
        db.prepare('SELECT * FROM website_monitor_checks WHERE website_id=? ORDER BY checked_at DESC,id DESC LIMIT 100').bind(id).all(),
        db.prepare('SELECT * FROM website_monitor_incidents WHERE website_id=? ORDER BY opened_at DESC,id DESC LIMIT 100').bind(id).all()
    ])
    return { monitor: presentMonitor(row), history: (history.results || []).map(row => ({ ...row, content_complete: Boolean(row.content_complete) })), incidents: incidents.results || [] }
}
export const getMonitorOverview = async (db: D1Database) => {
    const [rows, incidents, runner, unread] = await Promise.all([
        db.prepare(`${selectMonitor} ORDER BY w.name COLLATE NOCASE,w.id`).all<JoinedMonitor>(),
        db.prepare('SELECT i.*, w.name AS website_name FROM website_monitor_incidents i JOIN websites w ON w.id=i.website_id ORDER BY (i.read_at IS NULL) DESC,i.opened_at DESC,i.id DESC LIMIT 200').all(),
        db.prepare('SELECT last_started_at,last_completed_at,last_error FROM monitor_runner WHERE id=1').first(),
        db.prepare('SELECT COUNT(*) AS total FROM website_monitor_incidents WHERE read_at IS NULL').first<{ total: number }>()
    ])
    return { monitors: (rows.results || []).map(presentMonitor), incidents: incidents.results || [], runner, unread_count: unread?.total || 0 }
}

export const validateMonitorPatch = (body: Record<string, unknown>) => {
    const keys = Object.keys(body)
    if (!keys.length || keys.some(key => !['enabled', 'required_text', 'forbidden_text', 'allowed_redirect_hosts', 'baseline_title'].includes(key))) return '监控配置包含不支持的字段'
    if ('enabled' in body && typeof body.enabled !== 'boolean') return '启用状态必须为布尔值'
    for (const key of ['required_text', 'forbidden_text', 'allowed_redirect_hosts']) {
        if (!(key in body)) continue
        const items = body[key]
        if (!Array.isArray(items) || items.length > 20 || items.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) return '每组规则最多 20 条，每条为 1–500 个字符'
        if (key === 'allowed_redirect_hosts' && items.some(host => !/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(host))) return '允许跳转域名必须为公网主机名，不能包含协议或路径'
    }
    if ('baseline_title' in body && body.baseline_title !== null && (typeof body.baseline_title !== 'string' || body.baseline_title.length > 1000)) return '标题参考值不能超过 1000 个字符'
    return null
}
export const patchMonitor = async (db: D1Database, id: number, body: Record<string, unknown>) => {
    const error = validateMonitorPatch(body); if (error) throw new MonitorError(error)
    const values = Object.entries(body).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value.map(text => text.trim())) : typeof value === 'boolean' ? Number(value) : value] as const)
    const result = await db.prepare(`UPDATE website_monitors SET ${values.map(([key]) => `${key}=?`).join(',')},config_version=config_version+1,
        lease_token=NULL,lease_until=NULL,next_check_at=?,consecutive_failures=0 WHERE website_id=?`)
        .bind(...values.map(([, value]) => value), new Date().toISOString(), id).run()
    if (!result.meta.changes) throw new MonitorError('网站不存在', 404)
    return getMonitorDetail(db, id)
}

export const checkOne = async (db: D1Database, id: number, options: Options = {}) => {
    const now = options.now || new Date().toISOString()
    const token = crypto.randomUUID()
    const automaticGuard = options.automatic ? " AND next_check_at<=? AND enabled=1 AND EXISTS(SELECT 1 FROM websites w WHERE w.id=website_monitors.website_id AND w.lifecycle='active' AND w.stage<>'暂停')" : ''
    const leased = await db.prepare(`UPDATE website_monitors SET lease_token=?,lease_until=? WHERE website_id=? AND domain IS NOT NULL
        AND (lease_until IS NULL OR lease_until<=?)${automaticGuard} RETURNING *`).bind(token, isoAfter(now, 120_000), id, now, ...(options.automatic ? [now] : [])).first<MonitorState>()
    if (!leased) {
        const exists = await db.prepare('SELECT domain FROM website_monitors WHERE website_id=?').bind(id).first<{ domain: string | null }>()
        throw new MonitorError(exists ? exists.domain ? '网站正在检查，请稍后重试' : '网站没有主域名' : '网站不存在', exists?.domain ? 409 : 404)
    }
    return checkClaimed(db, leased, { ...options, now }, token)
}
const checkClaimed = async (db: D1Database, leased: MonitorState, options: Options & { now: string }, token: string, runnerToken?: string) => {
    try {
        const input = { domain: leased.domain!, allowed_redirect_hosts: JSON.parse(leased.allowed_redirect_hosts) }
        const result = await (options.checker || checkWebsite)(input)
        await saveResult(db, leased, result, options.now, token, Boolean(options.automatic), runnerToken)
        return result
    } catch (error) {
        await db.prepare('UPDATE website_monitors SET lease_token=NULL,lease_until=NULL WHERE website_id=? AND lease_token=?').bind(leased.website_id, token).run()
        throw error
    }
}
const saveResult = async (db: D1Database, row: MonitorState, result: MonitorCheckResult, now: string, token: string, automatic: boolean, runnerToken?: string) => {
    const failures = result.outcome === 'failure' ? row.consecutive_failures + 1 : 0
    const status = result.outcome === 'failure' && failures < 2 ? 'pending' : result.outcome
    const next = isoAfter(now, status === 'pending' ? 300_000 : 43_200_000)
    // Re-check the primary domain and configuration inside every write: a fetch can outlive an edit.
    const guard = `EXISTS(SELECT 1 FROM website_monitors m JOIN domains d ON d.id=m.domain_id WHERE m.website_id=? AND m.lease_token=? AND m.config_version=? AND d.id=? AND d.domain=? AND d.is_primary=1 AND d.website_id=m.website_id${automatic ? " AND m.enabled=1 AND EXISTS(SELECT 1 FROM websites w WHERE w.id=m.website_id AND w.lifecycle='active' AND w.stage<>'暂停')" : ''})`
    const bindings = [row.website_id, token, row.config_version, row.domain_id, row.domain]
    const statements = [db.prepare(`INSERT INTO website_monitor_checks (website_id,domain,checked_at,outcome,reason,http_status,response_ms,final_url,title,content_complete)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(row.website_id, row.domain, now, result.outcome, result.reason, result.http_status, Math.round(result.response_ms), result.final_url, result.title, Number(result.content_complete), ...bindings)]
    if (status === 'failure') {
        statements.push(db.prepare(`INSERT INTO website_monitor_incidents(website_id,domain,reason,opened_at,last_seen_at)
            SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(website_id) WHERE resolved_at IS NULL DO UPDATE SET reason=excluded.reason,last_seen_at=excluded.last_seen_at`)
            .bind(row.website_id, row.domain, result.reason, now, now, ...bindings))
    } else if (status === 'healthy') {
        statements.push(db.prepare(`UPDATE website_monitor_incidents SET resolved_at=? WHERE website_id=? AND resolved_at IS NULL AND ${guard}`).bind(now, row.website_id, ...bindings))
    }
    if (result.available !== null) statements.push(db.prepare(`UPDATE domains SET status=?,last_status_check_at=? WHERE id=? AND ${guard}`)
        .bind(result.available ? '在线' : '离线', new Date(Date.parse(now) + 8 * 3_600_000).toISOString().slice(0, 10), row.domain_id, ...bindings))
    statements.push(db.prepare(`UPDATE website_monitors SET status=?,reason=?,http_status=?,response_ms=?,final_url=?,title=?,checked_at=?,next_check_at=?,consecutive_failures=?,
        baseline_title=CASE WHEN baseline_title IS NULL AND ?='healthy' THEN ? ELSE baseline_title END,lease_token=NULL,lease_until=NULL WHERE website_id=? AND ${guard}`)
        .bind(status, result.reason, result.http_status, Math.round(result.response_ms), result.final_url, result.title, now, next, failures, status === 'healthy' && result.content_complete ? 'healthy' : 'incomplete', result.title ?? '', row.website_id, ...bindings))
    statements.push(db.prepare('UPDATE website_monitors SET lease_token=NULL,lease_until=NULL WHERE website_id=? AND lease_token=?').bind(row.website_id, token))
    if (runnerToken) statements.push(db.prepare('UPDATE monitor_runner SET last_completed_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?').bind(now, runnerToken))
    await db.batch(statements)
}

export const runMonitorTick = async (db: D1Database, options: Options = {}) => {
    const now = options.now || new Date().toISOString(); const token = crypto.randomUUID()
    // Claim the runner and its next due website atomically in one D1 round trip.
    const claimed = await db.batch([
        db.prepare(`INSERT INTO monitor_runner(id,last_started_at,lease_token,lease_until) VALUES(1,?,?,?)
            ON CONFLICT(id) DO UPDATE SET last_started_at=excluded.last_started_at,lease_token=excluded.lease_token,lease_until=excluded.lease_until
            WHERE monitor_runner.lease_until IS NULL OR monitor_runner.lease_until<=? RETURNING id`)
            .bind(now, token, isoAfter(now, 120_000), now),
        db.prepare(`UPDATE website_monitors SET lease_token=?,lease_until=? WHERE website_id=(
            SELECT m.website_id FROM website_monitors m JOIN websites w ON w.id=m.website_id
            WHERE m.enabled=1 AND w.lifecycle='active' AND w.stage<>'暂停' AND m.domain IS NOT NULL AND m.next_check_at<=?
              AND (m.lease_until IS NULL OR m.lease_until<=?)
            ORDER BY (m.status='pending') DESC,m.next_check_at,m.website_id LIMIT 1)
            AND EXISTS(SELECT 1 FROM monitor_runner WHERE id=1 AND lease_token=?) RETURNING *`)
            .bind(token, isoAfter(now, 120_000), now, now, token),
        db.prepare('DELETE FROM website_monitor_checks WHERE checked_at<? AND EXISTS(SELECT 1 FROM monitor_runner WHERE id=1 AND lease_token=?)')
            .bind(isoAfter(now, -30 * 86_400_000), token)
    ])
    if (!claimed[0].results?.length) return
    try {
        const site = claimed[1].results?.[0] as MonitorState | undefined
        if (site) {
            await checkClaimed(db, site, { ...options, now, automatic: true }, token, token)
        } else {
            await db.prepare('UPDATE monitor_runner SET last_completed_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?')
                .bind(now, token).run()
        }
    } catch (error) {
        await db.prepare('UPDATE monitor_runner SET last_error=?,lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?')
            .bind(error instanceof Error ? error.message.slice(0, 1000) : '巡检失败', token).run()
        throw error
    }
}
