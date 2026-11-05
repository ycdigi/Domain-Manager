<template>
  <div class="workspace-shell" :class="{ 'navigation-collapsed': navigationCollapsed }">
    <aside class="workspace-navigation" aria-label="网站导航"><WorkspaceNavigation :tabs="platformTabs" :counts="platformTabCounts" :active="activePlatform" :active-manager="activeManager" :collapsed="navigationCollapsed" @select="selectPlatform" @manage="navigateManager" @collapse="toggleNavigation" @backup="backup" @logout="logout" /></aside>
    <el-drawer v-model="navigationMobileOpen" class="workspace-navigation-drawer" title="网站导航" direction="ltr" size="256px" :with-header="false" @closed="runPendingNavigationAction">
      <WorkspaceNavigation :tabs="platformTabs" :counts="platformTabCounts" :active="activePlatform" :active-manager="activeManager" mobile @select="selectPlatform" @manage="navigateManager" @close="navigationMobileOpen = false" @backup="runNavigationAction(backup)" @logout="runNavigationAction(logout)" />
    </el-drawer>
    <main class="workspace-content">
      <router-view v-slot="{ Component }"><keep-alive include="Home"><component :is="Component" /></keep-alive></router-view>
    </main>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, provide, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import WorkspaceNavigation from '../components/WorkspaceNavigation.vue'
import { cachedValue, cachedGet, queryText } from '../utils/workspaceCache'
import { downloadJsonBackup } from '../utils/downloads'
import { logoutWorkspace } from '../router'
import type { DomainData } from '../api/domains'
import '../styles/workspace/workspace.css'
const route = useRoute(); const router = useRouter()
const navigationMobileOpen = ref(false); const navigationCollapsed = ref(false)
const navigationStorageKey = 'domain-manager.navigation-collapsed'
try { navigationCollapsed.value = localStorage.getItem(navigationStorageKey) === 'true' } catch { /* use expanded navigation */ }
const toggleNavigation = () => { navigationCollapsed.value = !navigationCollapsed.value; try { localStorage.setItem(navigationStorageKey, String(navigationCollapsed.value)) } catch { /* current view remains usable */ } }
const domains = cachedValue<DomainData[]>('/api/domains')
const platformTabs = [{ label: '全部', value: 'all' as const }, { label: 'Astro', value: 'Astro' as const }, { label: 'Next.js', value: 'Next.js' as const }, { label: 'WordPress', value: 'WordPress' as const }]
const platformTabCounts = computed(() => Object.fromEntries(platformTabs.map(tab => [tab.value, (domains.value || []).filter((row: DomainData) => tab.value === 'all' || row.platform === tab.value).length])) as Record<typeof platformTabs[number]['value'], number>)
const activePlatform = computed(() => route.name !== 'Home' ? '' : queryText(route.query.platform) || 'all')
const activeManager = computed(() => ({ Resources: 'resources', Adsense: 'adsense', Notifications: 'notifications', Data: 'data' }[String(route.name)] || ''))
let pendingNavigationAction: (() => void) | undefined
const runPendingNavigationAction = () => { const action = pendingNavigationAction; pendingNavigationAction = undefined; action?.() }
const runNavigationAction = (action: () => void) => { if (navigationMobileOpen.value) { pendingNavigationAction = action; navigationMobileOpen.value = false } else action() }
const workspaceQueries: Record<string, typeof route.query> = { [String(route.name)]: { ...route.query } }
watch(() => route.fullPath, () => { workspaceQueries[String(route.name)] = { ...route.query } })
const selectPlatform = (platform: string) => runNavigationAction(() => {
  const query = route.name === 'Home' ? { ...route.query } : { ...workspaceQueries.Home }
  delete query.site
  if (platform === 'all') delete query.platform; else query.platform = platform
  void router.push({ name: 'Home', query })
})
const navigateManager = (view: string) => runNavigationAction(() => { const name = { resources: 'Resources', adsense: 'Adsense', notifications: 'Notifications', data: 'Data' }[view]; void router.push({ name, query: workspaceQueries[name || ''] || {} }) })
const backup = async () => { try { await downloadJsonBackup(); ElMessage.success('JSON 备份已导出') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败') } }
const logout = () => { void logoutWorkspace() }
provide('openWorkspaceNavigation', () => { navigationMobileOpen.value = true })
provide('navigationMobileOpen', navigationMobileOpen)
const media = window.matchMedia('(min-width: 1024px)')
const closeMobileNavigation = () => { if (media.matches) navigationMobileOpen.value = false }
onMounted(() => { media.addEventListener('change', closeMobileNavigation); void cachedGet('/api/domains').catch(() => {}) })
onUnmounted(() => media.removeEventListener('change', closeMobileNavigation))
</script>
