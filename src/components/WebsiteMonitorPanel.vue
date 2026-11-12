<template>
  <section class="portfolio-detail-section website-monitor-panel" v-loading="loading">
    <div class="portfolio-detail-heading"><h2>网站监控</h2><el-button :disabled="busy || loading" @click="load(true)">刷新监控</el-button></div>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button :disabled="busy" @click="retry">重试</el-button></div>
    <template v-if="detail">
      <div class="monitor-actions"><el-tag :type="monitorTone(detail.monitor.status)">{{ monitorLabels[detail.monitor.status] }}</el-tag><span>{{ monitorReason(detail.monitor.reason, detail.monitor.http_status) }}</span><el-button :loading="busy" :disabled="loading" @click="runCheck">立即检查</el-button></div>
      <p v-if="!detail.monitor.effective_enabled" class="page-muted">当前未参与自动巡检，请检查监控开关、网站阶段和主域名。</p>
      <dl class="monitor-facts"><dt>最近检查（上海时间）</dt><dd>{{ monitorTime(detail.monitor.checked_at) }}</dd><template v-if="detail.monitor.effective_enabled"><dt>下次检查（上海时间）</dt><dd>{{ monitorNextCheck(detail.monitor) }}</dd></template><dt>HTTP / 响应时间</dt><dd>{{ detail.monitor.http_status ?? '—' }} / {{ detail.monitor.response_ms ?? '—' }} ms</dd><dt>最终地址</dt><dd>{{ detail.monitor.final_url || '—' }}</dd><dt>最新标题</dt><dd>{{ detail.monitor.title || '—' }}</dd></dl>
      <p class="page-muted">首次正常检查的标题作为参考基线，仅用于发现后续变化，不代表安全认证。检查读取服务器返回的 HTML，不执行 JavaScript；依赖脚本渲染的内容可能无法检查。</p>
      <p>标题基线：{{ detail.monitor.baseline_title === null ? '未设置' : detail.monitor.baseline_title === '' ? '无标题（已确认）' : detail.monitor.baseline_title }}</p>
      <el-button :disabled="!canConfirmTitle" @click="confirmTitle">保存最新标题为基线</el-button>
      <el-form label-position="top" class="monitor-config" @submit.prevent="save">
        <el-form-item label="自动监控"><el-switch v-model="form.enabled" aria-label="自动监控" :disabled="busy" /></el-form-item>
        <el-form-item label="必须包含的文本（每行一项）"><el-input v-model="form.required" type="textarea" :rows="3" aria-label="必须包含的文本" :disabled="busy" /></el-form-item>
        <el-form-item label="禁止包含的文本（每行一项）"><el-input v-model="form.forbidden" type="textarea" :rows="3" aria-label="禁止包含的文本" :disabled="busy" /></el-form-item>
        <el-form-item label="允许跳转的主机名（每行一项）"><el-input v-model="form.hosts" type="textarea" :rows="2" aria-label="允许跳转的主机名" :disabled="busy" placeholder="example.com" /></el-form-item>
        <el-button type="primary" native-type="submit" :disabled="!dirty || loading" :loading="busy">保存监控配置</el-button>
      </el-form>
      <h3>检查历史 · {{ detail.history.length }} 条（最多 100 条）</h3>
      <div class="monitor-table-scroll"><el-table :data="detail.history" size="small" empty-text="暂无检查历史"><el-table-column label="时间（上海）" width="185"><template #default="{ row }">{{ monitorTime(row.checked_at) }}</template></el-table-column><el-table-column prop="domain" label="检查域名" min-width="160" /><el-table-column label="结果" width="110"><template #default="{ row }">{{ monitorLabels[row.outcome as MonitorStatus] || row.outcome }}</template></el-table-column><el-table-column label="原因" min-width="140"><template #default="{ row }">{{ monitorReason(row.reason, row.http_status) }}</template></el-table-column><el-table-column prop="http_status" label="HTTP" width="75" /><el-table-column prop="response_ms" label="耗时 ms" width="90" /><el-table-column label="内容" width="90"><template #default="{ row }">{{ row.content_complete ? '完整' : '不完整' }}</template></el-table-column><el-table-column prop="title" label="标题" min-width="140" /><el-table-column prop="final_url" label="最终地址" min-width="180" /></el-table></div>
      <h3>事件记录</h3><p v-if="!detail.incidents.length" class="page-muted">暂无事件</p>
      <div v-for="incident in detail.incidents" :key="incident.id" class="monitor-incident"><span>{{ monitorReason(incident.reason) }} · {{ monitorTime(incident.opened_at) }} · {{ incident.resolved_at ? '已恢复' : '未恢复' }}<small>最近出现 {{ monitorTime(incident.last_seen_at) }}<template v-if="incident.resolved_at"> · 恢复 {{ monitorTime(incident.resolved_at) }}</template></small></span><el-button v-if="!incident.read_at" :disabled="busy" @click="markRead(incident.id)">标为已读</el-button></div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
import { getWebsiteMonitor, checkMonitor, updateMonitor, readIncident, monitorLabels, monitorReason, monitorTone, monitorTime, monitorNextCheck, monitorError, type MonitorDetail, type MonitorStatus } from '../api/monitor'
import '../styles/monitor.css'
const props = defineProps<{ websiteId: number }>()
const detail = ref<MonitorDetail>(); const loading = ref(false); const busy = ref(false); const error = ref('')
const form = reactive({ enabled: false, required: '', forbidden: '', hosts: '' })
const baseline = ref(''); const dirty = computed(() => Boolean(baseline.value && baseline.value !== JSON.stringify(form)))
const canConfirmTitle = computed(() => {
  if (!detail.value || loading.value || busy.value || dirty.value) return false
  const monitor = detail.value.monitor
  const sample = detail.value.history.find(check => check.checked_at === monitor.checked_at && check.domain === monitor.domain)
  return Boolean(monitor.checked_at && ['healthy', 'review'].includes(monitor.status)
    && sample?.content_complete && ['healthy', 'review'].includes(sample.outcome)
    && sample.title === monitor.title && (monitor.title || '') !== monitor.baseline_title)
})
const { canDiscard } = useUnsavedChanges(dirty)
const canClose = async () => { if (busy.value || loading.value) return false; if (!(await canDiscard())) return false; baseline.value = JSON.stringify(form); return true }
defineExpose({ canClose })
const reset = (value: MonitorDetail) => { detail.value = value; Object.assign(form, { enabled: value.monitor.enabled, required: value.monitor.required_text.join('\n'), forbidden: value.monitor.forbidden_text.join('\n'), hosts: value.monitor.allowed_redirect_hosts.join('\n') }); baseline.value = JSON.stringify(form) }
let retry = () => { void load(true) }
const load = async (force = false) => {
  if (dirty.value && !(await canDiscard())) return
  const id = props.websiteId; loading.value = true; error.value = ''; retry = () => { void load(true) }
  try { const value = await getWebsiteMonitor(id, force); if (id === props.websiteId) reset(value) }
  catch (e) { if (id === props.websiteId) error.value = monitorError(e) }
  finally { if (id === props.websiteId) loading.value = false }
}
const perform = async (action: () => Promise<void>) => { if (busy.value) return; busy.value = true; error.value = ''; retry = () => { void perform(action) }; try { await action() } catch (e) { error.value = monitorError(e) } finally { busy.value = false } }
const lines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean)
const save = () => perform(async () => { reset(await updateMonitor(props.websiteId, { enabled: form.enabled, required_text: lines(form.required), forbidden_text: lines(form.forbidden), allowed_redirect_hosts: lines(form.hosts) })) })
const runCheck = () => perform(async () => { const value = await checkMonitor(props.websiteId); detail.value = value })
const confirmTitle = () => {
  if (!canConfirmTitle.value) return
  const title = detail.value!.monitor.title || ''
  return perform(async () => { reset(await updateMonitor(props.websiteId, { baseline_title: title })) })
}
const markRead = (id: number) => perform(async () => { await readIncident(id); if (detail.value) detail.value.incidents = detail.value.incidents.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item) })
watch(() => props.websiteId, () => { detail.value = undefined; baseline.value = ''; void load() }, { immediate: true })
</script>
