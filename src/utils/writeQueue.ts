import { ref, computed } from 'vue'
import { useAuth } from './auth'
import { invalidateData } from './workspaceCache'
import { api, ApiError } from './request'

type OperationData = {
    type: 'domain_patch' | 'domain_operation_add' | 'resource_link_add' | 'resource_link_remove'
    id?: number
    domain_id?: number
    resource_id?: number
    role?: string
    is_primary?: number
    memo?: string
    fields?: Record<string, unknown>
    operation_date?: string
    operation_kind?: 'SEO' | '内容' | '技术' | '其他'
}
type QueueItem = { queueId: string; operation: OperationData; blocked?: boolean; error?: string }

const STORAGE_KEY = 'dm_write_queue_v2'
const MAX_ITEMS = 200
const pending = ref<QueueItem[]>([])
const inFlight = new Set<string>()
let initialized = false
let flushTimer: number | undefined
export type FlushResult = { pending: number; failed: number; synced: boolean }
const syncing = ref(false)
const failedCount = computed(() => pending.value.filter(item => item.blocked).length)
const result = (): FlushResult => ({ pending: pending.value.length, failed: failedCount.value, synced: pending.value.length === 0 })
let activeFlush: Promise<FlushResult> | undefined
let listenersInstalled = false

const initialize = () => {
    if (initialized || typeof window === 'undefined') return
    initialized = true
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Array<QueueItem | OperationData>
        pending.value = value.map((entry: any) => entry.queueId && entry.operation
            ? entry
            : { queueId: crypto.randomUUID(), operation: entry })
            .map(item => {
                if (item.operation.type !== 'domain_patch') return item
                const allowed = Object.fromEntries(Object.entries(item.operation.fields || {}).filter(([key]) => ['status', 'last_status_check_at', 'daily_clicks', 'daily_clicks_range', 'clicks_updated_date', 'seo_last_date'].includes(key)))
                return { ...item, operation: { ...item.operation, fields: allowed } }
            })
            .filter(item => item.operation.type !== 'domain_patch' || Object.keys(item.operation.fields || {}).length > 0)
        persist()
    } catch { pending.value = [] }
}

const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(pending.value))
const keyOf = (operation: OperationData) => {
    if (operation.type === 'domain_patch') return `domain:${operation.id}`
    if (operation.type === 'domain_operation_add') return `operation:${operation.domain_id}:${operation.operation_date}:${operation.operation_kind}`
    if (operation.type === 'resource_link_remove') return `link:remove:${operation.id}`
    return `link:add:${operation.domain_id}:${operation.resource_id}:${operation.role}`
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const enqueue = (operation: OperationData) => {
    initialize()
    const key = keyOf(operation)
    const index = pending.value.findIndex(item => keyOf(item.operation) === key && !inFlight.has(item.queueId))
    if (index >= 0 && operation.type === 'domain_patch') {
        const current = pending.value[index]
        current.operation = { ...current.operation, fields: { ...current.operation.fields, ...operation.fields } }
        current.blocked = false
        delete current.error
    } else if (index >= 0) {
        pending.value[index] = { ...pending.value[index], operation, blocked: false, error: undefined }
    } else {
        if (pending.value.length >= MAX_ITEMS) throw new Error('待同步任务已达到上限，请先完成同步')
        pending.value.push({ queueId: crypto.randomUUID(), operation })
    }
    persist()
    schedule()
}

const enqueueMany = (operations: OperationData[]) => {
    initialize()
    // Validate capacity before mutating so SEO date/history remain a single user action.
    const newKeys = new Set(operations.map(keyOf).filter(key => !pending.value.some(item => keyOf(item.operation) === key && !inFlight.has(item.queueId))))
    if (pending.value.length + newKeys.size > MAX_ITEMS) throw new Error('待同步任务已达到上限，请先完成同步')
    operations.forEach(enqueue)
}
export const applyPendingDomains = <T extends { id?: number }>(rows: T[]): T[] => {
    initialize()
    return rows.map(row => {
        const copy = { ...row } as T & Record<string, unknown>
        for (const item of pending.value) {
            const op = item.operation
            if (op.type === 'domain_patch' && op.id === row.id) Object.assign(copy, op.fields)
            if (op.type === 'domain_operation_add' && op.domain_id === row.id && op.operation_date && (!copy.latest_operation_date || String(copy.latest_operation_date) < op.operation_date)) Object.assign(copy, { latest_operation_date: op.operation_date })
        }
        return copy
    })
}

const runFlush = async () => {
    initialize()
    if (!pending.value.length) return
    const auth = useAuth().getAuthToken()
    if (!auth) return
    try {
        while (pending.value.length) {
            const chunk = pending.value.filter(item => !item.blocked).slice(0, 25)
            if (!chunk.length) return
            chunk.forEach(item => inFlight.add(item.queueId))
            let completed = false
            for (let attempt = 0; attempt <= 4 && !completed; attempt++) {
                try {
                    await api.post('/api/domains/batch', { operations: chunk.map(item => item.operation) })
                    const ids = new Set(chunk.map(item => item.queueId))
                    pending.value = pending.value.filter(item => !ids.has(item.queueId))
                    persist()
                    invalidateData('/api/domains', '/api/dashboard/summary', '/api/resources/links', '/api/resources/accounts', '/api/resources')
                    completed = true
                } catch (error) {
                    const retryable = error instanceof ApiError ? error.status >= 500 || error.status === 0 : true
                    if (!retryable || attempt === 4) {
                        const message = error instanceof Error ? error.message : '同步失败'
                        chunk.forEach(item => {
                            const queued = pending.value.find(entry => entry.queueId === item.queueId)
                            if (queued) { queued.blocked = true; queued.error = message }
                        })
                        persist()
                        completed = true
                        break
                    }
                    await sleep([1000, 3000, 10000, 30000][attempt])
                }
            }
            chunk.forEach(item => inFlight.delete(item.queueId))
        }
    } finally {
        inFlight.clear()
    }
}

const flush = () => {
    if (activeFlush) return activeFlush
    syncing.value = true
    activeFlush = runFlush().then(result).finally(() => { activeFlush = undefined; syncing.value = false })
    return activeFlush
}

const retryFailed = () => {
    pending.value.forEach(item => { item.blocked = false; delete item.error })
    persist()
    return flush()
}

const schedule = () => {
    if (typeof window === 'undefined') return
    if (flushTimer) window.clearTimeout(flushTimer)
    flushTimer = window.setTimeout(() => { void flush().catch(() => {}) }, 1500)
}

export const getWriteQueue = () => {
    initialize()
    if (!listenersInstalled && typeof window !== 'undefined') {
        listenersInstalled = true
        window.addEventListener('online', () => { void flush().catch(() => {}) })
        window.addEventListener('focus', () => { void flush().catch(() => {}) })
    }
    return { pending, syncing, failedCount, enqueue, enqueueMany, flush, retryFailed, applyPendingDomains }
}
