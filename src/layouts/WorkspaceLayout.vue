<template>
  <div class="workspace-shell" :class="{ 'navigation-collapsed': navigationCollapsed }">
    <aside class="workspace-navigation" aria-label="网站导航"><WorkspaceNavigation :monitor-unread="monitorOverview?.unread_count" :ownership-filters="ownershipFilters" :platform-filters="platformFilters" :counts="sidebarCounts" :active-ownership="activeOwnership" :active-platform="activePlatform" :active-manager="activeManager" :collapsed="navigationCollapsed" @select-filter="selectFilter" @manage="navigateManager" @collapse="toggleNavigation" @backup="backup" @logout="logout" /></aside>
    <el-drawer v-model="navigationMobileOpen" class="workspace-navigation-drawer" title="网站导航" direction="ltr" size="256px" :with-header="false" @closed="runPendingNavigationAction">
      <WorkspaceNavigation :monitor-unread="monitorOverview?.unread_count" :ownership-filters="ownershipFilters" :platform-filters="platformFilters" :counts="sidebarCounts" :active-ownership="activeOwnership" :active-platform="activePlatform" :active-manager="activeManager" mobile @select-filter="selectFilter" @manage="navigateManager" @close="navigationMobileOpen = false" @backup="runNavigationAction(backup)" @logout="runNavigationAction(logout)" />
    </el-drawer>
    <main class="workspace-content">
      <section v-if="queue.pending.value.length || queue.syncing.value" class="sync-status" aria-label="同步状态" aria-live="polite">
        <span>{{ queue.syncing.value ? '同步中' : '本机待同步' }} · {{ queue.pending.value.length }} 项<span v-if="queue.failedCount.value"> · 失败 {{ queue.failedCount.value }} 项</span></span>
        <button type="button" class="page-link" :aria-expanded="showSyncDetails" @click="showSyncDetails = !showSyncDetails">{{ showSyncDetails ? '收起详情' : '查看详情' }}</button>
        <el-button size="small" :disabled="queue.syncing.value" @click="syncNow">{{ queue.failedCount.value ? '重试失败任务' : '立即同步' }}</el-button>
        <ul v-if="showSyncDetails" class="sync-details"><li v-for="item in queue.pending.value" :key="item.queueId">域名 #{{ item.operation.id }} · {{ item.blocked ? item.error : '等待同步' }}</li></ul>
      </section>
      <router-view v-slot="{ Component }"><keep-alive include="Home"><component :is="Component" /></keep-alive></router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import WorkspaceNavigation from '../components/WorkspaceNavigation.vue'
import { cachedGet, cachedValue, queryText } from '../utils/workspaceCache'
import { downloadJsonBackup } from '../utils/downloads'
import { getWriteQueue } from '../utils/writeQueue'
import { logoutWorkspace } from '../router'
import type { Website } from '../api/websites'
import '../styles/workspace/workspace.css'
import '../styles/monitor.css'
import { monitorOverview, getMonitorOverview } from '../api/monitor'
const route = useRoute(); const router = useRouter()
const queue = getWriteQueue(); const showSyncDetails = ref(false)
const syncNow = async () => { try { const result = await queue.retryFailed(); if (result.synced) ElMessage.success('所有任务已同步'); else ElMessage.warning('部分任务仍待同步，请查看详情') } catch { ElMessage.error('同步未完成，请重试') } }
const navigationMobileOpen = ref(false); const navigationCollapsed = ref(false)
const navigationStorageKey = 'domain-manager.navigation-collapsed'
try { navigationCollapsed.value = localStorage.getItem(navigationStorageKey) === 'true' } catch { /* use expanded navigation */ }
const toggleNavigation = () => { navigationCollapsed.value = !navigationCollapsed.value; try { localStorage.setItem(navigationStorageKey, String(navigationCollapsed.value)) } catch { /* current view remains usable */ } }
const websites = cachedValue<Website[]>('/api/websites')
const ownershipFilters = [{ label: '全部归属', value: 'all' }, { label: '自营网站', value: '自营网站' }, { label: '企业客户网站', value: '企业客户网站' }, { label: '未分类', value: '未分类' }]
const platformFilters = [{ label: '全部技术栈', value: 'all' }, { label: 'Astro', value: 'Astro' }, { label: 'Next.js', value: 'Next.js' }, { label: 'WordPress', value: 'WordPress' }, { label: '其他', value: '其他' }]
const activeManager = computed(() => ({ Monitor: 'monitor', Domains: 'domains', Resources: 'resources', Adsense: 'adsense', Data: 'data' }[String(route.name)] || ''))
let pendingNavigationAction: (() => void) | undefined
const runPendingNavigationAction = () => { const action = pendingNavigationAction; pendingNavigationAction = undefined; action?.() }
const runNavigationAction = (action: () => void) => { if (navigationMobileOpen.value) { pendingNavigationAction = action; navigationMobileOpen.value = false } else action() }
const workspaceQueries: Record<string, typeof route.query> = { [String(route.name)]: { ...route.query } }
watch(() => route.fullPath, () => { workspaceQueries[String(route.name)] = { ...route.query } })
const homeQuery = computed(() => route.name === 'Home' ? route.query : workspaceQueries.Home || {})
const activeOwnership = computed(() => queryText(homeQuery.value.ownership) || 'all')
const activePlatform = computed(() => queryText(homeQuery.value.platform) || 'all')
const portfolioScope = computed(() => (websites.value || []).filter(site => {
  const stopped = homeQuery.value.view === 'stopped'
  return site.lifecycle === (stopped ? 'stopped' : 'active') && (stopped || !homeQuery.value.stage || site.stage === homeQuery.value.stage)
}))
const sidebarCounts = computed(() => {
  const ownershipScope = portfolioScope.value.filter(site => activePlatform.value === 'all' || site.platform === activePlatform.value)
  const platformScope = portfolioScope.value.filter(site => activeOwnership.value === 'all' || site.ownership === activeOwnership.value)
  return {
    ownership: Object.fromEntries(ownershipFilters.map(filter => [filter.value, filter.value === 'all' ? ownershipScope.length : ownershipScope.filter(site => site.ownership === filter.value).length])),
    platform: Object.fromEntries(platformFilters.map(filter => [filter.value, filter.value === 'all' ? platformScope.length : platformScope.filter(site => site.platform === filter.value).length]))
  }
})
const selectFilter = (kind: 'ownership' | 'platform', value: string) => runNavigationAction(() => {
  const query = { ...(route.name === 'Home' ? route.query : workspaceQueries.Home || {}) }
  delete query.site
  if (value === 'all') delete query[kind]; else query[kind] = value
  void router.push({ name: 'Home', query })
})
const navigateManager = (view: string) => runNavigationAction(() => { const name = { monitor: 'Monitor', domains: 'Domains', resources: 'Resources', adsense: 'Adsense', data: 'Data' }[view]; void router.push({ name, query: workspaceQueries[name || ''] || {} }) })
const backup = async () => { try { await downloadJsonBackup(); ElMessage.success('JSON 备份已导出') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败') } }
const logout = () => { void logoutWorkspace() }
provide('openWorkspaceNavigation', () => { navigationMobileOpen.value = true })
provide('navigationMobileOpen', navigationMobileOpen)
const media = window.matchMedia('(min-width: 1024px)')
const closeMobileNavigation = () => { if (media.matches) navigationMobileOpen.value = false }
onMounted(() => { media.addEventListener('change', closeMobileNavigation); void cachedGet('/api/websites').catch(() => {}) })
const refreshMonitor = () => { void getMonitorOverview(true).catch(() => {}) }
let monitorTimer: ReturnType<typeof setInterval>
watch(websites, refreshMonitor)
watch(() => route.fullPath, refreshMonitor)
onMounted(() => { refreshMonitor(); monitorTimer = setInterval(refreshMonitor, 60000) })
onUnmounted(() => { clearInterval(monitorTimer); media.removeEventListener('change', closeMobileNavigation) })
</script>
