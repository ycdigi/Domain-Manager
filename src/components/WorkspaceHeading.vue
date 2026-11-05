<template><header class="workspace-heading"><div class="workspace-heading-title"><el-button class="navigation-menu" :icon="Menu" aria-label="打开导航" :aria-expanded="navigationMobileOpen" @click="openNavigation?.()" /><div><h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p></div></div><div class="workspace-heading-actions"><slot /></div></header></template>
<script setup lang="ts">
import { inject, type Ref } from 'vue'
import { Menu } from '@element-plus/icons-vue'
defineProps<{ title: string; subtitle?: string }>()
const openNavigation = inject<() => void>('openWorkspaceNavigation')
const navigationMobileOpen = inject<Ref<boolean>>('navigationMobileOpen')
</script>
