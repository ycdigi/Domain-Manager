<template>
  <div class="workspace-page monitor-page">
    <WorkspaceHeading title="网站监控" :subtitle="monitorSubtitle"><div class="monitor-filters"><el-input v-model="search" placeholder="搜索网站或域名" clearable /><el-select v-model="status" aria-label="监控状态" placeholder="全部状态"><el-option label="全部状态" value="" /><el-option v-for="(label, key) in monitorLabels" :key="key" :label="label" :value="key" /></el-select></div><el-button :loading="loading" @click="load(true)">刷新</el-button></WorkspaceHeading>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <template v-if="overview">
      <el-alert v-if="staleRunner" title="超过 10 分钟未完成巡检" type="warning" :closable="false" />
      <el-alert v-if="overview.runner?.last_error" :title="overview.runner.last_error" type="error" :closable="false" />
      <div class="page-panel monitor-table-scroll" v-loading="loading">
        <table class="monitor-table"><thead><tr><th>网站 / 域名</th><th>页面标题</th><th>状态</th><th>HTTP / 耗时</th><th>最近检查</th><th>下次检查</th><th>操作</th></tr></thead><tbody><tr v-for="monitor in filtered" :key="monitor.website_id" :data-monitor-site="monitor.website_id"><td><strong>{{ monitor.website_name }}</strong><small>{{ monitor.domain || '未绑定主域名' }}</small></td><td class="monitor-page-title">{{ monitor.title || '未获取到标题' }}</td><td><el-tag :type="monitorTone(monitor.status)">{{ monitorLabels[monitor.status] }}</el-tag><small v-if="monitorCurrentReason(monitor)">{{ monitorCurrentReason(monitor) }}</small></td><td>{{ monitor.http_status ?? '—' }} / {{ monitor.response_ms ?? '—' }} ms</td><td>{{ monitorTime(monitor.checked_at) }}</td><td>{{ monitorNextCheck(monitor) }}</td><td><div class="monitor-actions"><el-switch :model-value="monitor.enabled" :disabled="busy.has(monitor.website_id)" :aria-label="`自动监控：${monitor.website_name}`" @change="value => toggle(monitor.website_id, Boolean(value))" /><el-button :loading="busy.has(monitor.website_id)" @click="check(monitor.website_id)">立即检查</el-button><el-button @click="openSite(monitor.website_id)">详情</el-button></div><p v-if="rowErrors[monitor.website_id]" role="alert" class="monitor-row-error">{{ rowErrors[monitor.website_id] }}</p></td></tr></tbody></table>
        <el-empty v-if="!filtered.length" :description="overview.monitors.length ? '没有匹配的网站' : '暂无网站监控'" />
      </div>

    </template>
    <div v-else-if="loading" v-loading="true" class="page-panel" aria-label="加载监控" style="min-height: 160px" />
    <div v-if="detailError" class="page-error" role="alert">{{ detailError }}<el-button @click="loadSites(true)">重试</el-button></div>
    <WebsiteDetailDrawer :visible="Boolean(route.query.site && selected)" :website="selected" @update:visible="closeSite" @changed="refreshSites" />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteDetailDrawer from '../components/WebsiteDetailDrawer.vue'
import { cachedValue } from '../utils/workspaceCache'
import { getWebsites, type Website } from '../api/websites'
import { monitorOverview as overview, getMonitorOverview, checkMonitor, updateMonitor, monitorLabels, monitorCurrentReason, monitorTone, monitorTime, monitorNextCheck, monitorError } from '../api/monitor'
import '../styles/monitor.css'
const route = useRoute(); const router = useRouter()
const loading = ref(false); const error = ref(''); const detailError = ref(''); const search = ref(''); const status = ref('')
const now = ref(Date.now()); let clock: ReturnType<typeof setInterval>
const sites = cachedValue<Website[]>('/api/websites')
const selected = computed(() => sites.value?.find(site => site.id === Number(route.query.site)))
const staleRunner = computed(() => !overview.value?.runner?.last_completed_at || now.value - Date.parse(overview.value.runner.last_completed_at) > 600000)
const monitorSubtitle = computed(() => overview.value?.runner?.last_completed_at ? `上次巡检 ${monitorTime(overview.value.runner.last_completed_at)} · 上海时间` : '等待首次巡检 · 上海时间')
const monitorStatusOrder: Record<string, number> = { failure: 0, pending: 1, review: 2, incomplete: 2, unchecked: 3, healthy: 4, disabled: 5 }
const filtered = computed(() => (overview.value?.monitors || []).filter(item => (!status.value || item.status === status.value) && `${item.website_name} ${item.domain || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())).sort((a, b) => {
  const statusOrder = (monitorStatusOrder[a.status] ?? 99) - (monitorStatusOrder[b.status] ?? 99)
  if (statusOrder) return statusOrder
  const checkedOrder = (Date.parse(b.checked_at || '') || 0) - (Date.parse(a.checked_at || '') || 0)
  return checkedOrder || a.website_name.localeCompare(b.website_name, 'zh-CN')
}))
const busy = reactive(new Set<number>()); const rowErrors = reactive<Record<number, string>>({})
const load = async (force = false) => { loading.value = true; error.value = ''; try { await getMonitorOverview(force); now.value = Date.now() } catch (e) { error.value = monitorError(e) } finally { loading.value = false } }
const loadSites = async (force = false) => { detailError.value = ''; try { await getWebsites(force) } catch (e) { detailError.value = monitorError(e) } }
const refreshSites = () => { void loadSites(true); void load(true) }
const openSite = (id: number) => { void loadSites(); void router.push({ query: { ...route.query, site: String(id) } }) }
const closeSite = (visible: boolean) => { if (!visible) { const query = { ...route.query }; delete query.site; void router.push({ query }) } }
const mutate = async (id: number, action: () => Promise<unknown>) => { if (busy.has(id)) return; busy.add(id); rowErrors[id] = ''; try { await action() } catch (e) { rowErrors[id] = monitorError(e) } finally { busy.delete(id) } }
const check = (id: number) => mutate(id, () => checkMonitor(id))
const toggle = (id: number, enabled: boolean) => mutate(id, () => updateMonitor(id, { enabled }))
onMounted(() => { void load(); void loadSites(); clock = setInterval(() => { now.value = Date.now() }, 60000) })
onUnmounted(() => clearInterval(clock))
</script>
