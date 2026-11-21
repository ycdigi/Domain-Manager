<template>
  <img v-if="url" :src="url" class="domain-favicon" alt="" width="20" height="20" @error="clear" /><span
    v-else
    class="domain-favicon-placeholder"
    aria-hidden="true"
    >◎</span
  >
</template>
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { api } from '../utils/request'
const props = defineProps<{ domainId?: number; revision?: number }>()
const url = ref('')
let version = 0
const clear = () => {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}
watch(
  () => [props.domainId, props.revision],
  async () => {
    const current = ++version
    clear()
    if (!props.domainId) return
    try {
      const blob = await api.blob(`/api/domains/${props.domainId}/favicon`, props.revision ? { cache: 'reload' } : {})
      if (current === version) url.value = URL.createObjectURL(blob)
    } catch {
      /* Missing cached icons use the placeholder. */
    }
  },
  { immediate: true }
)
onUnmounted(() => {
  version++
  clear()
})
</script>
<style scoped src="../styles/dialogs/domain-favicon.css"></style>
