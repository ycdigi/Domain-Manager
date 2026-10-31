import { ref } from 'vue'
import { useAuth } from './auth'
import router from '../router'

type OperationData = {
    type: 'domain_patch' | 'resource_link_add' | 'resource_link_remove'
    id?: number
    domain_id?: number
    resource_id?: number
    role?: string
    is_primary?: number
    memo?: string
    fields?: Record<string, unknown>
}
type QueueItem = { queueId: string; operation: OperationData; blocked?: boolean; error?: string }

const STORAGE_KEY = 'dm_write_queue_v2'
const MAX_ITEMS = 200
const pending = ref<QueueItem[]>([])
const inFlight = new Set<string>()
let initialized = false
let flushTimer: number | undefined
let activeFlush: Promise<void> | undefined
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
                const allowed = Object.fromEntries(Object.entries(item.operation.fields || {}).filter(([key]) => ['status', 'daily_clicks', 'seo_last_date'].includes(key)))
                return { ...item, operation: { ...item.operation, fields: allowed } }
            })
            .filter(item => item.operation.type !== 'domain_patch' || Object.keys(item.operation.fields || {}).length > 0)
        persist()
    } catch { pending.value = [] }
}

const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(pending.value))
const keyOf = (operation: OperationData) => {
    if (operation.type === 'domain_patch') return `domain:${operation.id}`
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
                    const response = await fetch('/api/domains/batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
                        body: JSON.stringify({ operations: chunk.map(item => item.operation) })
                    })
                    const result = await response.json() as { status?: number; message?: string }
                    if (!response.ok || (result.status ?? response.status) >= 400) {
                        if (response.status === 401) {
                            useAuth().clearAuth()
                            void router.push('/login')
                            throw Object.assign(new Error(result.message || '登录状态无效，请重新登录'), { retryable: false })
                        }
                        if (response.status < 500) throw Object.assign(new Error(result.message || `同步失败: ${response.status}`), { retryable: false })
                        throw new Error(result.message || `同步失败: ${response.status}`)
                    }
                    const ids = new Set(chunk.map(item => item.queueId))
                    pending.value = pending.value.filter(item => !ids.has(item.queueId))
                    persist()
                    completed = true
                } catch (error) {
                    const retryable = (error as { retryable?: boolean }).retryable !== false
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
    activeFlush = runFlush().finally(() => { activeFlush = undefined })
    return activeFlush
}

const retryFailed = () => {
    pending.value.forEach(item => { item.blocked = false; delete item.error })
    persist()
    schedule()
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
    return { pending, enqueue, flush, retryFailed }
}
