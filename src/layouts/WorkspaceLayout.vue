<template>
  <div class="workspace-shell" :class="{ 'navigation-collapsed': navigationCollapsed }">
    <aside class="workspace-navigation" aria-label="网站导航"><WorkspaceNavigation :monitor-unread="monitorOverview?.unread_count" :queue-counts="queueCounts" :active-manager="activeManager" :collapsed="navigationCollapsed" @manage="navigateManager" @collapse="toggleNavigation" @backup="backup" @logout="logout" /></aside>
    <el-drawer v-model="navigationMobileOpen" class="workspace-navigation-drawer" title="网站导航" direction="ltr" size="256px" :with-header="false" @closed="runPendingNavigationAction">
      <WorkspaceNavigation :monitor-unread="monitorOverview?.unread_count" :queue-counts="queueCounts" :active-manager="activeManager" mobile @manage="navigateManager" @close="navigationMobileOpen = false" @backup="runNavigationAction(backup)" @logout="runNavigationAction(logout)" />
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
import { cachedGet, cachedValue } from '../utils/workspaceCache'
import { downloadJsonBackup } from '../utils/downloads'
import { getWriteQueue } from '../utils/writeQueue'
import { logoutWorkspace } from '../router'
import type { Website } from '../api/websites'
import '../styles/workspace/workspace.css'
import '../styles/monitor.css'
import { monitorOverview, getMonitorOverview } from '../api/monitor'
import { getWorkQueue, type WorkQueue } from '../api/batches'
const route = useRoute(); const router = useRouter()
const queue = getWriteQueue(); const showSyncDetails = ref(false)
const syncNow = async () => { try { const result = await queue.retryFailed(); if (result.synced) ElMessage.success('所有任务已同步'); else ElMessage.warning('部分任务仍待同步，请查看详情') } catch { ElMessage.error('同步未完成，请重试') } }
const navigationMobileOpen = ref(false); const navigationCollapsed = ref(false)
const queueCounts = ref<WorkQueue['counts']>({ monitor: 0, next_action: 0, task: 0, batch: 0, total: 0 })
const navigationStorageKey = 'domain-manager.navigation-collapsed'
try { navigationCollapsed.value = localStorage.getItem(navigationStorageKey) === 'true' } catch { /* use expanded navigation */ }
const toggleNavigation = () => { navigationCollapsed.value = !navigationCollapsed.value; try { localStorage.setItem(navigationStorageKey, String(navigationCollapsed.value)) } catch { /* current view remains usable */ } }
const websites = cachedValue<Website[]>('/api/websites')
const activeManager = computed(() => ({ Home: 'home', Finance: 'finance', WorkQueue: 'work', Batches: 'batches', BatchDetail: 'batches', Monitor: 'monitor', Domains: 'domains', Resources: 'resources', Adsense: 'adsense', Data: 'data' }[String(route.name)] || ''))
let pendingNavigationAction: (() => void) | undefined
const runPendingNavigationAction = () => { const action = pendingNavigationAction; pendingNavigationAction = undefined; action?.() }
const runNavigationAction = (action: () => void) => { if (navigationMobileOpen.value) { pendingNavigationAction = action; navigationMobileOpen.value = false } else action() }
const workspaceQueries: Record<string, typeof route.query> = { [String(route.name)]: { ...route.query } }
watch(() => route.fullPath, () => { workspaceQueries[String(route.name)] = { ...route.query } })
const navigateManager = (view: string) => runNavigationAction(() => { const name = { home: 'Home', finance: 'Finance', work: 'WorkQueue', batches: 'Batches', monitor: 'Monitor', domains: 'Domains', resources: 'Resources', adsense: 'Adsense', data: 'Data' }[view]; void router.push({ name, query: workspaceQueries[name || ''] || {} }) })
const backup = async () => { try { await downloadJsonBackup(); ElMessage.success('JSON 备份已导出') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败') } }
const logout = () => { void logoutWorkspace() }
provide('openWorkspaceNavigation', () => { navigationMobileOpen.value = true })
provide('navigationMobileOpen', navigationMobileOpen)
const media = window.matchMedia('(min-width: 1024px)')
const closeMobileNavigation = () => { if (media.matches) navigationMobileOpen.value = false }
onMounted(() => { media.addEventListener('change', closeMobileNavigation); void cachedGet('/api/websites').catch(() => {}) })
const refreshMonitor = () => { void getMonitorOverview(true).catch(() => {}) }
const refreshBatchContext = async () => { try { queueCounts.value = (await getWorkQueue(true)).counts } catch { /* page-level views show their own errors */ } }
let monitorTimer: ReturnType<typeof setInterval>
watch(websites, refreshMonitor)
watch(() => route.fullPath, () => { refreshMonitor(); void refreshBatchContext() })
onMounted(() => { refreshMonitor(); void refreshBatchContext(); monitorTimer = setInterval(() => { refreshMonitor(); void refreshBatchContext() }, 60000) })
onUnmounted(() => { clearInterval(monitorTimer); media.removeEventListener('change', closeMobileNavigation) })
</script>
