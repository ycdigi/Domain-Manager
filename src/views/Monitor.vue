<template>
  <div class="workspace-page monitor-page">
    <WorkspaceHeading title="网站监控" subtitle="HTTP可用性与跳转"><el-button :loading="loading" @click="load(true)">刷新</el-button></WorkspaceHeading>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <template v-if="overview">
      <el-alert v-if="staleRunner" title="超过 10 分钟未完成巡检" type="warning" :closable="false" />
      <el-alert v-if="overview.runner?.last_error" :title="overview.runner.last_error" type="error" :closable="false" />
      <p class="page-muted">最近开始 {{ monitorTime(overview.runner?.last_started_at || null) }} · 最近完成 {{ monitorTime(overview.runner?.last_completed_at || null) }} · 上海时间</p>
      <div class="monitor-filters"><el-input v-model="search" placeholder="搜索网站或域名" clearable /><el-select v-model="status" aria-label="监控状态"><el-option label="全部状态" value="" /><el-option v-for="(label, key) in monitorLabels" :key="key" :label="label" :value="key" /></el-select></div>
      <div class="page-panel monitor-table-scroll" v-loading="loading">
        <table class="monitor-table"><thead><tr><th>网站 / 域名</th><th>状态</th><th>HTTP / 耗时</th><th>最近检查（上海）</th><th>下次检查（上海）</th><th>操作</th></tr></thead><tbody><tr v-for="monitor in filtered" :key="monitor.website_id" :data-monitor-site="monitor.website_id"><td><strong>{{ monitor.website_name }}</strong><small>{{ monitor.domain || '未绑定主域名' }}</small></td><td><el-tag :type="monitorTone(monitor.status)">{{ monitorLabels[monitor.status] }}</el-tag><small v-if="monitorCurrentReason(monitor)">{{ monitorCurrentReason(monitor) }}</small></td><td>{{ monitor.http_status ?? '—' }} / {{ monitor.response_ms ?? '—' }} ms</td><td>{{ monitorTime(monitor.checked_at) }}</td><td>{{ monitorNextCheck(monitor) }}</td><td><div class="monitor-actions"><el-switch :model-value="monitor.enabled" :disabled="busy.has(monitor.website_id)" :aria-label="`自动监控：${monitor.website_name}`" @change="value => toggle(monitor.website_id, Boolean(value))" /><el-button :loading="busy.has(monitor.website_id)" @click="check(monitor.website_id)">立即检查</el-button><el-button @click="openSite(monitor.website_id)">详情</el-button></div><p v-if="rowErrors[monitor.website_id]" role="alert" class="monitor-row-error">{{ rowErrors[monitor.website_id] }}</p></td></tr></tbody></table>
        <el-empty v-if="!filtered.length" :description="overview.monitors.length ? '没有匹配的网站' : '暂无网站监控'" />
      </div>
      <section class="page-panel"><h2>事件 · 未读 {{ overview.unread_count }}</h2><el-checkbox v-model="unreadOnly">仅看未读</el-checkbox><p v-if="!incidents.length" class="page-muted">暂无事件</p><article v-for="incident in incidents" :key="incident.id" class="monitor-incident"><div><button class="page-link" @click="openSite(incident.website_id)">{{ incident.website_name || incident.domain }}</button> · {{ monitorReason(incident.reason) }}<small>{{ monitorTime(incident.opened_at) }} · 最近出现 {{ monitorTime(incident.last_seen_at) }} · {{ incident.resolved_at ? `已恢复 ${monitorTime(incident.resolved_at)}` : '未恢复' }}</small><p v-if="incidentErrors[incident.id]" role="alert">{{ incidentErrors[incident.id] }}</p></div><el-button v-if="!incident.read_at" :loading="reading.has(incident.id)" @click="markRead(incident.id)">标为已读</el-button></article></section>
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
import { monitorOverview as overview, getMonitorOverview, checkMonitor, updateMonitor, readIncident, monitorLabels, monitorReason, monitorCurrentReason, monitorTone, monitorTime, monitorNextCheck, monitorError } from '../api/monitor'
import '../styles/monitor.css'
const route = useRoute(); const router = useRouter()
const loading = ref(false); const error = ref(''); const detailError = ref(''); const search = ref(''); const status = ref(''); const unreadOnly = ref(true)
const now = ref(Date.now()); let clock: ReturnType<typeof setInterval>
const sites = cachedValue<Website[]>('/api/websites')
const selected = computed(() => sites.value?.find(site => site.id === Number(route.query.site)))
const staleRunner = computed(() => !overview.value?.runner?.last_completed_at || now.value - Date.parse(overview.value.runner.last_completed_at) > 600000)
const filtered = computed(() => (overview.value?.monitors || []).filter(item => (!status.value || item.status === status.value) && `${item.website_name} ${item.domain || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const incidents = computed(() => (overview.value?.incidents || []).filter(item => !unreadOnly.value || !item.read_at))
const busy = reactive(new Set<number>()); const rowErrors = reactive<Record<number, string>>({}); const reading = reactive(new Set<number>()); const incidentErrors = reactive<Record<number, string>>({})
const load = async (force = false) => { loading.value = true; error.value = ''; try { await getMonitorOverview(force); now.value = Date.now() } catch (e) { error.value = monitorError(e) } finally { loading.value = false } }
const loadSites = async (force = false) => { detailError.value = ''; try { await getWebsites(force) } catch (e) { detailError.value = monitorError(e) } }
const refreshSites = () => { void loadSites(true); void load(true) }
const openSite = (id: number) => { void loadSites(); void router.push({ query: { ...route.query, site: String(id) } }) }
const closeSite = (visible: boolean) => { if (!visible) { const query = { ...route.query }; delete query.site; void router.push({ query }) } }
const mutate = async (id: number, action: () => Promise<unknown>) => { if (busy.has(id)) return; busy.add(id); rowErrors[id] = ''; try { await action() } catch (e) { rowErrors[id] = monitorError(e) } finally { busy.delete(id) } }
const check = (id: number) => mutate(id, () => checkMonitor(id))
const toggle = (id: number, enabled: boolean) => mutate(id, () => updateMonitor(id, { enabled }))
const markRead = async (id: number) => { if (reading.has(id)) return; reading.add(id); incidentErrors[id] = ''; try { await readIncident(id) } catch (e) { incidentErrors[id] = monitorError(e) } finally { reading.delete(id) } }
onMounted(() => { void load(); void loadSites(); clock = setInterval(() => { now.value = Date.now() }, 60000) })
onUnmounted(() => clearInterval(clock))
</script>
