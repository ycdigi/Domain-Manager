<template>
  <div class="workspace-page link-sources-page">
    <WorkspaceHeading title="外链来源" subtitle="审核来源、维护模板，再为具体网站建立候选">
      <el-button :icon="Refresh" :loading="loading" aria-label="刷新来源" title="刷新来源" @click="load(true)" />
      <el-button type="primary" :icon="Plus" @click="openCreate">新增来源</el-button>
      <el-button :icon="Upload" :loading="importing" @click="sourceFileInput?.click()">导入来源清单</el-button>
      <el-button :icon="Finished" :loading="reviewImporting" @click="reviewFileInput?.click()">导入轮询结果</el-button>
      <input ref="sourceFileInput" class="link-sources-file-input" type="file" accept=".json,application/json" @change="handleImportFile">
      <input ref="reviewFileInput" class="link-sources-file-input" type="file" accept=".json,application/json" @change="handleReviewImportFile">
    </WorkspaceHeading>

    <div v-if="error" class="page-error" role="alert"><span>{{ error }}</span><el-button @click="load(true)">重试</el-button></div>
    <section class="link-source-summary" aria-label="来源漏斗">
      <button v-for="item in summary" :key="item.label" type="button" class="link-source-summary-item" :class="{ 'is-active': funnelFilter === item.value }" @click="funnelFilter = item.value"><strong>{{ item.count }}</strong><span>{{ item.label }}</span></button>
    </section>
    <p v-if="reviewRun" class="link-source-run-status">最近轮询：{{ reviewRun.status }} · 完成 {{ reviewRun.completed_count }}/{{ reviewRun.planned_count }} · 失败 {{ reviewRun.failed_count }}</p>

    <section class="page-panel link-source-panel">
      <div class="link-source-toolbar">
        <el-input v-model="search" :prefix-icon="Search" clearable placeholder="搜索名称、来源 URL、标签" aria-label="搜索外链来源" />
        <el-select v-model="typeFilter" clearable placeholder="全部类型" aria-label="来源类型筛选"><el-option v-for="type in linkSourceTypes" :key="type" :label="type" :value="type" /></el-select>
        <el-select v-model="modeFilter" clearable placeholder="全部处理模式" aria-label="处理模式筛选"><el-option v-for="mode in linkSubmissionModes" :key="mode" :label="mode" :value="mode" /></el-select>
        <el-select v-model="approvalFilter" clearable placeholder="全部审核状态" aria-label="审核状态筛选"><el-option v-for="status in linkSourceApprovalStatuses" :key="status" :label="status" :value="status" /></el-select>
      </div>
      <el-table v-loading="loading" :data="filteredSources" row-key="id" border stripe>
        <el-table-column label="来源" min-width="250" fixed="left">
          <template #default="scope"><div class="link-source-identity"><strong>{{ scope.row.name }}</strong><a :href="scope.row.source_url" target="_blank" rel="noopener noreferrer">{{ scope.row.source_url }}</a><small v-if="scope.row.url_template">模板：{{ scope.row.url_template }}</small></div></template>
        </el-table-column>
        <el-table-column prop="source_type" label="类型" width="116" />
        <el-table-column label="国家 / 语言" width="130"><template #default="scope">{{ [scope.row.country, scope.row.language].filter(Boolean).join(' · ') || '未记录' }}</template></el-table-column>
        <el-table-column prop="submission_mode" label="处理模式" width="112" />
        <el-table-column label="审核状态" width="126"><template #default="scope"><el-select size="small" :model-value="scope.row.approval_status" :disabled="savingIds.has(scope.row.id)" @change="value => changeApproval(scope.row, value)"><el-option v-for="status in linkSourceApprovalStatuses" :key="status" :label="status" :value="status" /></el-select></template></el-table-column>
        <el-table-column label="轮询结果" width="150"><template #default="scope"><div class="link-source-review-result"><strong>{{ scope.row.funnel_stage || '未检查' }}</strong><small>{{ scope.row.check_status || '未检查' }}<template v-if="scope.row.http_status"> · {{ scope.row.http_status }}</template></small></div></template></el-table-column>
        <el-table-column label="启用" width="82"><template #default="scope"><el-switch :model-value="scope.row.enabled === 1" :disabled="scope.row.approval_status !== '已批准' || savingIds.has(scope.row.id)" @change="value => changeEnabled(scope.row, Boolean(value))" /></template></el-table-column>
        <el-table-column prop="opportunity_count" label="候选" width="72" align="right" />
        <el-table-column label="审查标记" min-width="180"><template #default="scope"><span class="link-source-flags">{{ scope.row.audit_flags || '无' }}</span></template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right"><template #default="scope"><div class="link-source-actions"><el-button text :icon="EditPen" :disabled="savingIds.has(scope.row.id)" aria-label="编辑来源" title="编辑来源" @click="openEdit(scope.row)" /><el-button text :icon="Delete" type="danger" :disabled="savingIds.has(scope.row.id)" aria-label="删除来源" title="删除来源" @click="removeSource(scope.row)" /></div></template></el-table-column>
      </el-table>
      <p v-if="!loading && !filteredSources.length" class="page-empty">没有符合条件的来源。</p>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑外链来源' : '新增外链来源'" width="min(720px, 94vw)" append-to-body>
      <el-form label-position="top" @submit.prevent="saveSource">
        <div class="link-source-form-grid">
          <el-form-item label="来源名称" required><el-input v-model="form.name" maxlength="200" /></el-form-item>
          <el-form-item label="来源类型"><el-select v-model="form.source_type"><el-option v-for="type in linkSourceTypes" :key="type" :label="type" :value="type" /></el-select></el-form-item>
          <el-form-item label="来源 URL" required><el-input v-model="form.source_url" placeholder="https://example.com" /></el-form-item>
          <el-form-item label="URL 模板"><el-input v-model="form.url_template" placeholder="https://example.com/submit?url={{target_url}}" /></el-form-item>
          <el-form-item label="国家"><el-input v-model="form.country" maxlength="120" /></el-form-item>
          <el-form-item label="语言"><el-input v-model="form.language" maxlength="120" /></el-form-item>
          <el-form-item label="处理模式"><el-select v-model="form.submission_mode"><el-option v-for="mode in linkSubmissionModes" :key="mode" :label="mode" :value="mode" /></el-select></el-form-item>
          <el-form-item label="审核状态"><el-select v-model="form.approval_status"><el-option v-for="status in linkSourceApprovalStatuses" :key="status" :label="status" :value="status" /></el-select></el-form-item>
          <el-form-item label="主题标签" class="link-source-form-full"><el-input v-model="form.topic_tags" maxlength="1000" placeholder="calculator, SaaS, developer" /></el-form-item>
          <el-form-item label="备注" class="link-source-form-full"><el-input v-model="form.memo" type="textarea" :rows="4" maxlength="5000" /></el-form-item>
        </div>
        <p class="link-source-form-note">新来源默认进入待审核和仅观察。批准后仍需人工确认来源真的适合提交。</p>
      </el-form>
      <template #footer><div class="dialog-footer"><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveSource">保存</el-button></div></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, EditPen, Finished, Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import { confirmAction, isDismissed } from '../utils/feedback'
import { getLinkSources, createLinkSource, updateLinkSource, deleteLinkSource, importLinkSources, getLinkSourceReview, importLinkSourceReview, linkSourceApprovalStatuses, linkSourceTypes, linkSubmissionModes, type LinkSource, type LinkSourceApprovalStatus, type LinkSourceFunnelStage, type LinkSourceReviewRun, type LinkSourceType, type LinkSubmissionMode } from '../api/link-sources'

type SourceForm = { name: string; source_url: string; source_type: LinkSourceType; country: string; language: string; topic_tags: string; url_template: string; submission_mode: LinkSubmissionMode; approval_status: LinkSourceApprovalStatus; memo: string }
const sources = ref<LinkSource[]>([]); const reviewRun = ref<LinkSourceReviewRun | null>(null)
const loading = ref(false); const importing = ref(false); const reviewImporting = ref(false); const saving = ref(false); const error = ref('')
const search = ref(''); const typeFilter = ref<LinkSourceType>(); const modeFilter = ref<LinkSubmissionMode>(); const approvalFilter = ref<LinkSourceApprovalStatus>(); const funnelFilter = ref<'all' | LinkSourceFunnelStage>('all')
const dialogVisible = ref(false); const editingId = ref<number>(); const sourceFileInput = ref<HTMLInputElement>(); const reviewFileInput = ref<HTMLInputElement>()
const savingIds = reactive(new Set<number>())
const form = reactive<SourceForm>({ name: '', source_url: '', source_type: '无法判断', country: '', language: '', topic_tags: '', url_template: '', submission_mode: '仅观察', approval_status: '待审核', memo: '' })

const load = async (force = false) => { loading.value = true; error.value = ''; try { const [sourceRows, review] = await Promise.all([getLinkSources(force), getLinkSourceReview()]); sources.value = sourceRows; reviewRun.value = review.run } catch (e) { error.value = e instanceof Error ? e.message : '来源加载失败' } finally { loading.value = false } }
const filteredSources = computed(() => sources.value.filter(source => {
  if (funnelFilter.value !== 'all' && (source.funnel_stage || '未检查') !== funnelFilter.value) return false
  if (approvalFilter.value && source.approval_status !== approvalFilter.value) return false
  if (typeFilter.value && source.source_type !== typeFilter.value) return false
  if (modeFilter.value && source.submission_mode !== modeFilter.value) return false
  const query = search.value.trim().toLowerCase()
  return !query || `${source.name} ${source.source_url} ${source.topic_tags || ''} ${source.country || ''} ${source.language || ''}`.toLowerCase().includes(query)
}))
const summary = computed(() => [{ label: '全部', value: 'all' as const, count: sources.value.length }, ...(['未检查', '建议保留', '待删除'] as LinkSourceFunnelStage[]).map(stage => ({ label: stage, value: stage, count: sources.value.filter(source => (source.funnel_stage || '未检查') === stage).length }))])
const resetForm = () => Object.assign(form, { name: '', source_url: '', source_type: '无法判断', country: '', language: '', topic_tags: '', url_template: '', submission_mode: '仅观察', approval_status: '待审核', memo: '' })
const openCreate = () => { editingId.value = undefined; resetForm(); dialogVisible.value = true }
const openEdit = (source: LinkSource) => { editingId.value = source.id; Object.assign(form, { name: source.name, source_url: source.source_url, source_type: source.source_type, country: source.country || '', language: source.language || '', topic_tags: source.topic_tags || '', url_template: source.url_template || '', submission_mode: source.submission_mode, approval_status: source.approval_status, memo: source.memo || '' }); dialogVisible.value = true }
const saveSource = async () => {
  if (saving.value) return
  saving.value = true
  try { const payload = { ...form, url_template: form.url_template || null, country: form.country || null, language: form.language || null, topic_tags: form.topic_tags || null, memo: form.memo || null }; if (editingId.value) await updateLinkSource(editingId.value, payload); else await createLinkSource(payload); dialogVisible.value = false; await load(true); ElMessage.success('来源已保存') }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '来源保存失败') }
  finally { saving.value = false }
}
const patchSource = async (source: LinkSource, payload: Record<string, unknown>) => { if (savingIds.has(source.id)) return; savingIds.add(source.id); try { await updateLinkSource(source.id, payload); await load(true) } catch (e) { ElMessage.error(e instanceof Error ? e.message : '来源更新失败') } finally { savingIds.delete(source.id) } }
const changeApproval = (source: LinkSource, value: LinkSourceApprovalStatus) => { void patchSource(source, { approval_status: value }) }
const changeEnabled = (source: LinkSource, value: boolean) => { void patchSource(source, { enabled: value ? 1 : 0 }) }
const removeSource = async (source: LinkSource) => { try { await confirmAction(`删除来源“${source.name}”？`, '删除来源', { confirmButtonText: '删除' }); await deleteLinkSource(source.id); await load(true); ElMessage.success('来源已删除') } catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '来源删除失败') } }
const handleImportFile = async (event: Event) => {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''
  if (!file || importing.value) return
  importing.value = true
  try {
    const parsed = JSON.parse(await file.text()) as { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
    const rows = Array.isArray(parsed) ? parsed : parsed.rows
    if (!Array.isArray(rows)) throw new Error('文件中没有 rows 数组')
    const eligible = rows.filter(row => row.valid !== false && !(Array.isArray(row.audit_flags) && row.audit_flags.includes('重复模板')))
    const excluded = rows.length - eligible.length
    if (!eligible.length) throw new Error('没有可导入的有效、非重复来源')
    await confirmAction(`准备导入 ${eligible.length} 条来源；另有 ${excluded} 条无效或重复记录会跳过。所有导入记录仍为“待审核”“仅观察”，不会自动访问或提交。`, '导入外链来源', { confirmButtonText: '导入待审核来源' })
    let created = 0; let skipped = 0
    for (let offset = 0; offset < eligible.length; offset += 500) {
      const result = await importLinkSources(eligible.slice(offset, offset + 500))
      created += result.created; skipped += result.skipped.length
    }
    ElMessage.success(`导入完成：新增 ${created} 条，跳过 ${skipped + excluded} 条`)
    await load(true)
  } catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '来源导入失败') }
  finally { importing.value = false }
}
const handleReviewImportFile = async (event: Event) => {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''
  if (!file || reviewImporting.value) return
  reviewImporting.value = true
  try {
    const parsed = JSON.parse(await file.text()) as { run?: Record<string, unknown>; results?: Array<Record<string, unknown>> }
    if (!Array.isArray(parsed.results)) throw new Error('文件中没有 results 数组')
    await confirmAction(`准备更新 ${parsed.results.length} 条来源轮询结果。结果只用于来源漏斗筛选，不会自动批准或提交外链。`, '导入轮询结果', { confirmButtonText: '导入结果' })
    const result = await importLinkSourceReview(parsed)
    await load(true)
    ElMessage.success(`轮询结果已更新：${result.updated} 条`)
  } catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '轮询结果导入失败') }
  finally { reviewImporting.value = false }
}
watch(dialogVisible, value => { if (!value) editingId.value = undefined })
void load()
</script>

<style scoped src="../styles/link-sources/link-sources.css"></style>
