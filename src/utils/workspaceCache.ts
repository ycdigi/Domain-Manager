import { ref, type Ref } from 'vue'
import { api } from './request'

// Session-only read cache. Credentials and exports never use this cache.
type Entry = { data: Ref<unknown>; dirty: boolean; request?: Promise<any>; generation: number }
const entries = new Map<string, Entry>()
export const cachedValue = <T>(url: string): Ref<T> => {
    if (!entries.has(url)) entries.set(url, { data: ref<unknown>(), dirty: true, generation: 0 })
    return entries.get(url)!.data as Ref<T>
}
export const cachedGet = async <T>(url: string, force = false): Promise<T> => {
    const data = cachedValue<T>(url)
    const entry = entries.get(url)!
    if (entry.request) {
        const result = await entry.request
        if (entry.request) entry.request = undefined
        return entry.dirty ? cachedGet<T>(url) : result
    }
    if (!force && !entry.dirty && data.value !== undefined) return data.value
    const generation = entry.generation
    const request = api.get<T>(url).then(value => {
        if (generation === entry.generation) { data.value = value; entry.dirty = false }
        return value
    })
    entry.request = request
    let result: T
    try { result = await request } finally { if (entry.request === request) entry.request = undefined }
    return entry.dirty ? cachedGet<T>(url) : result
}
export const invalidateData = (...prefixes: string[]) => {
    for (const [url, entry] of entries) if (prefixes.some(prefix => url === prefix || url.startsWith(prefix + '?') || url.startsWith(prefix + '/'))) {
        entry.dirty = true
        entry.generation++
    }
}
export const clearWorkspaceCache = () => {
    for (const entry of entries.values()) { entry.generation++; entry.data.value = undefined; entry.dirty = true }
    entries.clear()
}
export const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const localMonth = () => localDate().slice(0, 7)
export const queryText = (value: unknown) => typeof value === 'string' ? value : ''
