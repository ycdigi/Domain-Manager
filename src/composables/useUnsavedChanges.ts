import { onMounted, onUnmounted, type ComputedRef } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationNormalized } from 'vue-router'
import { useAuth } from '../utils/auth'
import { confirmAction } from '../utils/feedback'

export const confirmDiscard = async (dirty: boolean) => {
    if (!dirty || !useAuth().getAuthToken()) return true
    try { await confirmAction('尚有未保存的修改，是否放弃？', '离开编辑', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }); return true }
    catch { return false }
}
export const useUnsavedChanges = (dirty: ComputedRef<boolean>, options: { route?: boolean; unload?: boolean; blocked?: ComputedRef<boolean>; leaving?: (to: RouteLocationNormalized, from: RouteLocationNormalized) => boolean } = {}) => {
    const canDiscard = () => options.blocked?.value ? Promise.resolve(false) : confirmDiscard(dirty.value)
    if (options.route !== false) {
        onBeforeRouteLeave(canDiscard)
        onBeforeRouteUpdate((to, from) => (options.leaving ? options.leaving(to, from) : to.fullPath !== from.fullPath) ? canDiscard() : true)
    }
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
    if (options.unload !== false) {
        onMounted(() => window.addEventListener('beforeunload', beforeUnload))
        onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))
    }
    return { canDiscard }
}
