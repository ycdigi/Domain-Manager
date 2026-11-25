<template>
  <span class="computer-identity" :title="name">
    <svg v-if="identity.laptop" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="13" rx="1" /><path d="M4 16 2 20h20l-2-4M9 18h6" /></svg>
    <el-icon v-else aria-hidden="true"><Monitor /></el-icon>
    <span><span v-if="identity.prefix" class="computer-identity-model">{{ identity.prefix }} </span>{{ identity.label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Monitor } from '@element-plus/icons-vue'
import { computerIdentity } from '../utils/computer-options'
const props = defineProps<{ name: string }>()
const identity = computed(() => computerIdentity(props.name))
</script>

<style scoped src="../styles/dialogs/computer-identity.css"></style>
