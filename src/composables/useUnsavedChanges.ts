import { onMounted, onUnmounted, type ComputedRef } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useAuth } from '../utils/auth'
import { confirmAction } from '../utils/feedback'

export const useUnsavedChanges = (dirty: ComputedRef<boolean>) => {
    const canDiscard = async () => {
        if (!dirty.value || !useAuth().getAuthToken()) return true
        try { await confirmAction('尚有未保存的修改，是否放弃？', '离开编辑', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }); return true }
        catch { return false }
    }
    onBeforeRouteLeave(canDiscard)
    onBeforeRouteUpdate((to, from) => to.fullPath === from.fullPath ? true : canDiscard())
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
    onMounted(() => window.addEventListener('beforeunload', beforeUnload))
    onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))
    return { canDiscard }
}
