import { computed, reactive, ref } from 'vue'

type Read = { read: () => Promise<unknown>; assign: (value: any) => void }
// One session owns section generations and draft baselines. Forms register their
// own state; the host does not need to aggregate every dirty/busy flag itself.
export const createWebsiteSession = () => {
    const identity = ref<number>()
    const errors = reactive<Record<string, string>>({})
    const loading = reactive<Record<string, boolean>>({})
    const saving = reactive<Record<string, boolean>>({})
    const baselines = reactive(new Map<string, string>())
    const drafts = new Map<string, () => unknown>()
    const activities: Array<() => boolean> = []
    const externalDrafts: Array<() => boolean> = []
    const loaded = new Set<string>()
    const versions = new Map<string, number>()
    const discarded = ref(false)
    let generation = 0
    const serialize = (value: unknown) => JSON.stringify(value) ?? ''
    const clean = (key?: string) => {
        for (const [name, read] of drafts) if (!key || name === key) baselines.set(name, serialize(read()))
    }
    const isDirty = (key: string) => baselines.has(key) && baselines.get(key) !== serialize(drafts.get(key)?.())
    const dirty = computed(() => Boolean(identity.value) && !discarded.value && ([...drafts.keys()].some(isDirty) || externalDrafts.some(read => read())))
    const busy = computed(() => Object.values(saving).some(Boolean) || activities.some(read => read()))
    const begin = (id?: number) => {
        identity.value = id; generation++; discarded.value = false; loaded.clear(); versions.clear()
        for (const key of Object.keys(errors)) delete errors[key]
        for (const key of Object.keys(loading)) delete loading[key]
        for (const key of Object.keys(saving)) delete saving[key]
        clean()
    }
    const load = async (section: string, reads: Read[], force = false) => {
        if (!identity.value || !force && loaded.has(section)) return
        const current = generation, version = (versions.get(section) ?? 0) + 1
        versions.set(section, version); loading[section] = true; errors[section] = ''
        const active = () => current === generation && version === versions.get(section)
        const results = await Promise.allSettled(reads.map(async item => {
            const value = await item.read()
            if (active()) item.assign(value)
        }))
        if (!active()) return
        errors[section] = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason instanceof Error ? result.reason.message : '分区读取失败').join('；')
        if (!errors[section]) loaded.add(section)
        loading[section] = false
    }
    const save = async <T,>(key: string, action: () => Promise<T>, apply: (value: T, unchanged: boolean) => void | Promise<void> = () => {}) => {
        if (!identity.value || saving[key]) return
        const current = generation
        const read = drafts.get(key), submitted = read && serialize(read())
        saving[key] = true
        try {
            const value = await action()
            if (current === generation) {
                const unchanged = !read || serialize(read()) === submitted
                const applying = apply(value, unchanged)
                // Synchronous form resets belong to this save; later edits do not.
                const accepted = unchanged && read ? serialize(read()) : submitted
                await applying
                if (current === generation && accepted !== undefined) baselines.set(key, accepted)
            }
            return value
        } finally { if (current === generation) saving[key] = false }
    }
    const leave = async (confirm: (dirty: boolean) => Promise<boolean>) => {
        if (busy.value || !await confirm(dirty.value)) return false
        discarded.value = true
        return true
    }
    return { identity, errors, loading, saving, dirty, busy, begin, clean, isDirty, load, save, leave,
        draft: (key: string, read: () => unknown) => { drafts.set(key, read); clean(key) },
        observe: (read: () => { dirty?: boolean; busy?: boolean } | undefined) => { externalDrafts.push(() => Boolean(read()?.dirty)); activities.push(() => Boolean(read()?.busy)) },
        activity: (read: () => boolean) => { activities.push(read) },
        externalDraft: (read: () => boolean) => { externalDrafts.push(read) } }
}
