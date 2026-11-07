<template>
  <div class="workspace-shell" :class="{ 'navigation-collapsed': navigationCollapsed }">
    <aside class="workspace-navigation" aria-label="网站导航"><WorkspaceNavigation :portfolio-tabs="portfolioTabs" :counts="portfolioCounts" :active-portfolio="activePortfolio" :active-manager="activeManager" :collapsed="navigationCollapsed" @select-portfolio="selectPortfolio" @manage="navigateManager" @collapse="toggleNavigation" @backup="backup" @logout="logout" /></aside>
    <el-drawer v-model="navigationMobileOpen" class="workspace-navigation-drawer" title="网站导航" direction="ltr" size="256px" :with-header="false" @closed="runPendingNavigationAction">
      <WorkspaceNavigation :portfolio-tabs="portfolioTabs" :counts="portfolioCounts" :active-portfolio="activePortfolio" :active-manager="activeManager" mobile @select-portfolio="selectPortfolio" @manage="navigateManager" @close="navigationMobileOpen = false" @backup="runNavigationAction(backup)" @logout="runNavigationAction(logout)" />
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
const route = useRoute(); const router = useRouter()
const queue = getWriteQueue(); const showSyncDetails = ref(false)
const syncNow = async () => { try { const result = await queue.retryFailed(); if (result.synced) ElMessage.success('所有任务已同步'); else ElMessage.warning('部分任务仍待同步，请查看详情') } catch { ElMessage.error('同步未完成，请重试') } }
const navigationMobileOpen = ref(false); const navigationCollapsed = ref(false)
const navigationStorageKey = 'domain-manager.navigation-collapsed'
try { navigationCollapsed.value = localStorage.getItem(navigationStorageKey) === 'true' } catch { /* use expanded navigation */ }
const toggleNavigation = () => { navigationCollapsed.value = !navigationCollapsed.value; try { localStorage.setItem(navigationStorageKey, String(navigationCollapsed.value)) } catch { /* current view remains usable */ } }
const websites = cachedValue<Website[]>('/api/websites')
const stageKeys = ['待评估', '验证', '增长', '维护', '暂停']
const portfolioTabs = [{ label: '全部网站', value: 'all' }, ...stageKeys.map(stage => ({ label: stage, value: stage })), { label: '停止经营', value: 'stopped' }]
const activePortfolio = computed(() => { const query = queryText(route.query.view || route.query.stage); return portfolioTabs.some(tab => tab.value === query) ? query : 'all' })
const portfolioCounts = computed(() => Object.fromEntries(portfolioTabs.map(tab => [tab.value, (websites.value || []).filter(site => tab.value === 'all' || (tab.value === 'stopped' ? site.lifecycle === 'stopped' : site.lifecycle === 'active' && site.stage === tab.value)).length])))
const activeManager = computed(() => ({ Domains: 'domains', Resources: 'resources', Adsense: 'adsense', Data: 'data' }[String(route.name)] || ''))
let pendingNavigationAction: (() => void) | undefined
const runPendingNavigationAction = () => { const action = pendingNavigationAction; pendingNavigationAction = undefined; action?.() }
const runNavigationAction = (action: () => void) => { if (navigationMobileOpen.value) { pendingNavigationAction = action; navigationMobileOpen.value = false } else action() }
const workspaceQueries: Record<string, typeof route.query> = { [String(route.name)]: { ...route.query } }
watch(() => route.fullPath, () => { workspaceQueries[String(route.name)] = { ...route.query } })
const selectPortfolio = (value: string) => runNavigationAction(() => {
  const query = route.name === 'Home' ? { ...route.query } : { ...workspaceQueries.Home }
  delete query.stage; delete query.view; delete query.site
  if (value === 'stopped') query.view = 'stopped'; else if (value !== 'all') query.stage = value
  void router.push({ name: 'Home', query })
})
const navigateManager = (view: string) => runNavigationAction(() => { const name = { domains: 'Domains', resources: 'Resources', adsense: 'Adsense', data: 'Data' }[view]; void router.push({ name, query: workspaceQueries[name || ''] || {} }) })
const backup = async () => { try { await downloadJsonBackup(); ElMessage.success('JSON 备份已导出') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败') } }
const logout = () => { void logoutWorkspace() }
provide('openWorkspaceNavigation', () => { navigationMobileOpen.value = true })
provide('navigationMobileOpen', navigationMobileOpen)
const media = window.matchMedia('(min-width: 1024px)')
const closeMobileNavigation = () => { if (media.matches) navigationMobileOpen.value = false }
onMounted(() => { media.addEventListener('change', closeMobileNavigation); void cachedGet('/api/websites').catch(() => {}) })
onUnmounted(() => media.removeEventListener('change', closeMobileNavigation))
</script>
