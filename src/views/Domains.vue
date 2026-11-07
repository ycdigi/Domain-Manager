<template>
  <div class="workspace-page domain-assets-page">
    <WorkspaceHeading title="域名资产" subtitle="注册信息、在线状态与网站归属">
      <el-button :icon="Refresh" :loading="loading" aria-label="刷新域名" title="刷新域名" @click="load(true)" />
      <el-button type="primary" :icon="Plus" @click="openCreate">新增域名</el-button>
    </WorkspaceHeading>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <section class="page-panel" v-loading="loading">
      <div class="panel-heading"><h2>全部域名</h2><span class="page-muted">{{ domains.length }} 个</span></div>
      <div v-if="domains.length" class="domain-asset-list">
        <article v-for="domain in domains" :key="domain.id" class="domain-asset-row">
          <div class="domain-asset-identity"><strong>{{ domain.domain }}</strong><span>{{ domain.registrar }} · {{ domain.domain_role }} · 到期 {{ domain.expiry_date }}</span></div>
          <el-select :model-value="domain.website_id || undefined" clearable placeholder="未分配网站" :aria-label="`${domain.domain} 所属网站`" @change="value => assignWebsite(domain, value)">
            <el-option v-for="site in websites" :key="site.id" :label="site.name" :value="site.id" />
          </el-select>
          <div class="domain-asset-state"><el-tag :type="domain.status === '在线' ? 'success' : 'info'">{{ domain.status }}</el-tag><small v-if="domain.last_status_check_at">检查于 {{ domain.last_status_check_at.slice(0, 10) }}</small><small v-else>尚未检查</small></div>
          <div class="domain-asset-actions">
            <el-button text :loading="checkingId === domain.id" :aria-label="`检查域名 ${domain.domain}`" @click="checkDomain(domain)">检查</el-button>
            <el-button text :aria-label="`编辑域名 ${domain.domain}`" @click="openEdit(domain)">编辑</el-button>
            <el-button text type="danger" :aria-label="`删除域名 ${domain.domain}`" @click="removeDomain(domain)"><Delete /></el-button>
          </div>
        </article>
      </div>
      <p v-else-if="!loading" class="page-empty">还没有域名资产。</p>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑域名' : '新增域名'" width="min(680px, 94vw)" destroy-on-close>
      <el-form label-position="top" class="page-form page-form-grid" @submit.prevent="saveDomain">
        <el-form-item label="域名" required><el-input v-model="form.domain" maxlength="255" /></el-form-item>
        <el-form-item label="所属网站"><el-select v-model="form.website_id" clearable placeholder="保持为未分配"><el-option v-for="site in websites" :key="site.id" :label="site.name" :value="site.id" /></el-select></el-form-item>
        <el-form-item label="注册商" required><el-input v-model="form.registrar" /></el-form-item>
        <el-form-item label="注册商链接"><el-input v-model="form.registrar_link" /></el-form-item>
        <el-form-item label="注册日期" required><el-date-picker v-model="form.registrar_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="到期日期" required><el-date-picker v-model="form.expiry_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="服务类型" required><el-input v-model="form.service_type" /></el-form-item>
        <el-form-item label="域名用途"><el-select v-model="form.domain_role"><el-option v-for="role in domainRoles" :key="role" :label="role" :value="role" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status"><el-option label="在线" value="在线" /><el-option label="离线" value="离线" /></el-select></el-form-item>
        <el-form-item label="管理电脑"><el-input v-model="form.computer_name" maxlength="100" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.memo" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
      </el-form>
      <template #footer><div class="dialog-footer"><el-button :disabled="saving" @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDomain">保存</el-button></div></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Plus, Refresh } from '@element-plus/icons-vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import type { Website } from '../api/websites'
import { api } from '../utils/request'
import { cachedGet, invalidateData } from '../utils/workspaceCache'
import { confirmAction, isDismissed } from '../utils/feedback'
import { getWriteQueue } from '../utils/writeQueue'

interface DomainRecord { id: number; website_id: number | null; domain: string; registrar: string; registrar_link?: string | null; registrar_date: string; expiry_date: string; service_type: string; domain_role: '主域名' | '跳转域名' | '备用域名'; is_primary: number; status: '在线' | '离线'; computer_name?: string | null; memo?: string | null; last_status_check_at?: string | null }
const domainRoles = ['主域名', '跳转域名', '备用域名'] as const
const queue = getWriteQueue()
const domains = ref<DomainRecord[]>([])
const websites = ref<Website[]>([])
const loading = ref(false); const saving = ref(false); const error = ref(''); const dialogVisible = ref(false); const editingId = ref<number>(); const checkingId = ref<number | null>(null)
const emptyForm = () => ({ website_id: undefined as number | undefined, domain: '', registrar: '', registrar_link: '', registrar_date: '', expiry_date: '', service_type: '网站', domain_role: '备用域名', status: '离线', computer_name: '', memo: '' })
const form = reactive(emptyForm())
const load = async (force = false) => {
  loading.value = true; error.value = ''
  try {
    const [domainRows, websiteRows] = await Promise.all([cachedGet<DomainRecord[]>('/api/domains', force), cachedGet<Website[]>('/api/websites', force)])
    domains.value = queue.applyPendingDomains(domainRows); websites.value = websiteRows
  } catch (e) { error.value = e instanceof Error ? e.message : '域名资产读取失败' }
  finally { loading.value = false }
}
const resetForm = () => { Object.assign(form, emptyForm()); editingId.value = undefined }
const openCreate = () => { resetForm(); dialogVisible.value = true }
const openEdit = (item: DomainRecord) => { resetForm(); editingId.value = item.id; Object.assign(form, { website_id: item.website_id || undefined, domain: item.domain, registrar: item.registrar, registrar_link: item.registrar_link || '', registrar_date: item.registrar_date, expiry_date: item.expiry_date, service_type: item.service_type, domain_role: item.domain_role, status: item.status, computer_name: item.computer_name || '', memo: item.memo || '' }); dialogVisible.value = true }
const saveDomain = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const body = { ...form, website_id: form.website_id ?? null, registrar_link: form.registrar_link || null, memo: form.memo || null }
    if (editingId.value) await api.patch(`/api/domains/${editingId.value}`, body)
    else await api.post('/api/domains', body)
    dialogVisible.value = false; invalidateData('/api/domains', '/api/websites'); await load(true); ElMessage.success('域名已保存')
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '域名保存失败') }
  finally { saving.value = false }
}
const assignWebsite = async (item: DomainRecord, value: number | undefined) => {
  try { const updated = await api.patch<DomainRecord>(`/api/domains/${item.id}`, { website_id: value ?? null }); Object.assign(item, updated); invalidateData('/api/domains', '/api/websites'); ElMessage.success(value ? '网站归属已更新' : '域名已设为未分配') }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '网站归属更新失败'); await load(true) }
}
const checkDomain = async (item: DomainRecord) => {
  if (checkingId.value != null) return
  checkingId.value = item.id
  try {
    const result = await api.post<{ status: '在线' | '离线' }>('/api/domains/check', { domain: item.domain })
    const checkedAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    queue.enqueue({ type: 'domain_patch', id: item.id, fields: { status: result.status, last_status_check_at: checkedAt } })
    Object.assign(item, { status: result.status, last_status_check_at: checkedAt })
    const synced = await queue.flush()
    ElMessage[synced.pending ? 'warning' : 'success'](synced.pending ? '检查完成，状态已保存在本机待同步' : `检查完成：${result.status}`)
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '域名检查失败') }
  finally { checkingId.value = null }
}
const removeDomain = async (item: DomainRecord) => {
  try { await confirmAction(`删除域名“${item.domain}”？`, '删除域名', { confirmButtonText: '删除' }); await api.delete(`/api/domains/${item.id}`); invalidateData('/api/domains', '/api/websites'); await load(true); ElMessage.success('域名已删除') }
  catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '域名删除失败') }
}
void load()
</script>

<style scoped src="../styles/domain-assets/domain-assets.css"></style>
