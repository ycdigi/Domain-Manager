<template>
  <div class="workspace-page batch-detail-page">
    <WorkspaceHeading :title="batch?.name || '批次详情'" :subtitle="batch ? `${batch.status} · ${activeMembers.length} 个当前成员` : '加载批次'">
      <el-button @click="back">返回批次</el-button>
      <el-button @click="batchInfoVisible = true">批次编辑</el-button>
      <el-button v-if="batch && batch.status === '进行中'" type="warning" @click="requestReview">请求复盘</el-button>
      <el-button v-if="batch && batch.status === '待复盘'" type="primary" @click="reviewVisible = true">开始复盘</el-button>
      <el-button v-if="batch && batch.status !== '已归档'" @click="archive">归档</el-button>
    </WorkspaceHeading>

    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <template v-if="batch">


      <section class="batch-member-section">

        <div class="batch-member-toolbar">
          <div class="batch-member-selection"><el-checkbox :model-value="allFilteredSelected" :indeterminate="someFilteredSelected" :disabled="!filteredActiveMembers.length" aria-label="选择当前筛选成员" @change="toggleFiltered(Boolean($event))" /><span>当前筛选 {{ filteredActiveMembers.length }} 个，已选 {{ selectedIds.size }} 个</span></div>
          <div class="batch-member-filters"><el-input v-model="search" clearable placeholder="搜索网站" aria-label="搜索批次成员" /><el-select v-model="stageFilter" clearable placeholder="阶段" aria-label="按阶段筛选"><el-option v-for="stage in stages" :key="stage" :label="stage" :value="stage" /></el-select><el-button v-if="!selectedIds.size" size="small" type="primary" @click="batchAssignmentVisible = true">批量加入网站</el-button></div>
        </div>
        <div v-if="selectedIds.size" class="batch-member-bulk-toolbar"><el-input v-model="bulkNote" maxlength="500" placeholder="共同成员备注（可选）" aria-label="共同成员备注" /><el-button size="small" :loading="bulkSaving" @click="saveBulkNote">保存备注</el-button><el-select v-model="bulkScenario" clearable filterable allow-create default-first-option placeholder="批量设置场景" aria-label="批量设置场景"><el-option v-for="scenario in scenarios" :key="scenario" :label="scenario" :value="scenario" /></el-select><el-button size="small" :loading="bulkSaving" @click="applyBulk({ operating_scenario: bulkScenario || null })">设置场景</el-button><el-select v-model="bulkStage" placeholder="批量设置阶段" aria-label="批量设置阶段"><el-option v-for="stage in stages" :key="stage" :label="stage" :value="stage" /></el-select><el-button size="small" type="primary" :loading="bulkSaving" @click="applyBulk({ stage: bulkStage })">设置阶段</el-button><el-button size="small" type="danger" :loading="memberSaving" @click="removeSelected">批量移出</el-button><el-button size="small" text @click="selectedIds.clear()">清空</el-button></div>

        <div v-if="filteredActiveMembers.length" class="batch-members-table-wrap"><table class="batch-members-table"><thead><tr><th class="batch-member-select-column"><el-checkbox :model-value="allFilteredSelected" :indeterminate="someFilteredSelected" aria-label="选择当前筛选成员" @change="toggleFiltered(Boolean($event))" /></th><th>网站 / 主域名</th><th>技术栈</th><th>经营场景</th><th>内容规模</th><th>统计日期</th><th>阶段</th><th>加入批次</th><th>操作</th></tr></thead><tbody><tr v-for="member in filteredActiveMembers" :key="member.membership_id"><td class="batch-member-select-column"><el-checkbox :model-value="selectedIds.has(member.website_id)" :aria-label="`选择网站：${member.name}`" @change="toggle(member.website_id, Boolean($event))" /></td><td><button class="page-link batch-member-name" @click="openSite(member.website_id)">{{ member.name }}</button><small>{{ memberDomain(member) || '未设置域名' }}</small></td><td>{{ member.platform }}</td><td>{{ member.operating_scenario || '未设置场景' }}</td><td><strong>{{ memberContent(member) }}</strong><small v-if="member.member_note">备注：{{ member.member_note }}</small></td><td>{{ member.content_stats_updated_date || '未记录' }}</td><td>{{ member.stage }}</td><td>{{ shortDate(member.joined_at) }}</td><td class="batch-member-actions"><el-button text @click="openSite(member.website_id)">查看</el-button><el-button text type="danger" @click="remove(member.website_id)">移出</el-button></td></tr></tbody></table></div><p v-else class="page-empty">没有符合条件的当前成员。</p>

        <details v-if="filteredRemovedMembers.length" class="batch-member-history"><summary>已移出成员（{{ filteredRemovedMembers.length }}）</summary><ul class="batch-members-list"><li v-for="member in filteredRemovedMembers" :key="member.membership_id" class="is-removed"><div class="batch-member-main"><button class="page-link" @click="openSite(member.website_id)">{{ member.name }}</button><small>{{ member.platform }} · {{ member.operating_scenario || '未设置场景' }} · {{ member.stage }}</small><p class="page-muted">{{ shortDate(member.removed_at) }}<template v-if="member.removed_reason"> · {{ member.removed_reason }}</template></p></div><span class="page-muted">历史成员</span></li></ul></details>
      </section>

      <section v-if="batch.latest_review" class="page-panel"><div class="panel-heading"><h2>最近复盘</h2><span class="page-muted">{{ batch.latest_review.reviewed_at }}</span></div><p v-if="batch.latest_review.conclusion">{{ batch.latest_review.conclusion }}</p><p v-if="batch.latest_review.next_action" class="page-muted">下一步：{{ batch.latest_review.next_action }}</p><div class="batch-review-summary"><span>成员 {{ batch.latest_review.member_count }}</span><span>页面 {{ batch.latest_review.content_totals.page_count }}</span><span>文章 {{ batch.latest_review.content_totals.wp_article_count }}</span><span>计算器 {{ batch.latest_review.content_totals.wp_calculator_count }}</span></div><p v-if="batch.review_changed" class="page-error">复盘后网站数据发生变化，建议重新复盘。</p></section>
    </template>

    <WebsiteDetailDrawer v-model:visible="websiteDrawerVisible" :website="selectedWebsite" @changed="handleWebsiteChanged" />
    <BatchAssignmentDialog v-if="batch" v-model="batchAssignmentVisible" :websites="sites" :batches="[]" :fixed-batch-id="batch.id" :exclude-website-ids="activeMemberIds" :submitting="memberSaving" @submit="assignMembers" />
    <el-dialog v-model="batchInfoVisible" title="编辑批次信息" width="min(720px, 94vw)"><el-form label-position="top"><div class="batch-form-grid"><el-form-item label="批次名称"><el-input v-model="form.name" maxlength="200" /></el-form-item><el-form-item label="状态"><el-select v-model="form.status"><el-option v-for="status in statuses" :key="status" :label="status" :value="status" /></el-select></el-form-item><el-form-item label="来源"><el-input v-model="form.source" maxlength="200" /></el-form-item><el-form-item label="目标"><el-input v-model="form.goal" type="textarea" :rows="2" maxlength="2000" /></el-form-item><el-form-item class="batch-form-full" label="初始假设"><el-input v-model="form.hypothesis" type="textarea" :rows="2" maxlength="2000" /></el-form-item><el-form-item class="batch-form-full" label="复盘结论"><el-input v-model="form.review_conclusion" type="textarea" :rows="2" maxlength="2000" /></el-form-item><el-form-item class="batch-form-full" label="下一步"><el-input v-model="form.next_action" maxlength="300" /></el-form-item></div></el-form><template #footer><el-button @click="batchInfoVisible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">保存</el-button></template></el-dialog>
    <el-dialog v-model="reviewVisible" title="保存批次复盘" width="min(560px, 94vw)"><el-form label-position="top"><el-form-item label="复盘结论"><el-input v-model="reviewForm.conclusion" type="textarea" :rows="4" maxlength="2000" /></el-form-item><el-form-item label="下一步"><el-input v-model="reviewForm.next_action" maxlength="300" /></el-form-item></el-form><template #footer><el-button @click="reviewVisible=false">取消</el-button><el-button type="primary" :loading="reviewSaving" @click="completeReview">保存复盘</el-button></template></el-dialog>
  </div>
</template>

<script setup lang="ts">
import '../styles/workspace/batches.css'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteDetailDrawer from '../components/WebsiteDetailDrawer.vue'
import BatchAssignmentDialog from '../components/BatchAssignmentDialog.vue'
import { isDismissed } from '../utils/feedback'
import { addBatchMembers, assignBatch, completeBatchReview, getBatch, removeBatchMembers, requestBatchReview, updateBatch, type BatchAssignmentPayload, type BatchDetail } from '../api/batches'
import { bulkUpdateWebsites, getWebsites, type Website, type WebsiteStage } from '../api/websites'

const route = useRoute(); const router = useRouter(); const batch = ref<BatchDetail>(); const sites = ref<Website[]>([]); const loading = ref(false); const saving = ref(false); const batchInfoVisible = ref(false); const memberSaving = ref(false); const websiteDrawerVisible = ref(false); const selectedWebsite = ref<Website>(); const bulkSaving = ref(false); const reviewSaving = ref(false); const error = ref(''); const search = ref(''); const stageFilter = ref(''); const selectedIds = reactive(new Set<number>()); const reviewVisible = ref(false); const batchAssignmentVisible = ref(false); const bulkNote = ref('')
const statuses = ['进行中', '待复盘', '已复盘', '已归档']; const stages: WebsiteStage[] = ['待评估', '验证', '增长', '维护', '暂停']; const scenarios = ['Astro 内容站', 'WordPress 计算器站', 'WordPress 资讯站', '通用网站']; const bulkScenario = ref(''); const bulkStage = ref<WebsiteStage>('待评估'); const reviewForm = reactive({ conclusion: '', next_action: '' }); const form = reactive({ name: '', source: '', goal: '', hypothesis: '', status: '进行中', review_conclusion: '', next_action: '' }); const baseline = ref('')
const activeMembers = computed(() => (batch.value?.members || []).filter(member => member.membership_status === 'active'))
const activeMemberIds = computed(() => activeMembers.value.map(member => member.website_id))
const memberDomain = (member: BatchDetail['members'][number]) => sites.value.find(site => site.id === member.website_id)?.domains.find(domain => domain.is_primary)?.domain || sites.value.find(site => site.id === member.website_id)?.domains[0]?.domain || ''
const memberContent = (member: BatchDetail['members'][number]) => member.operating_scenario === 'Astro 内容站' ? `页面 ${member.page_count ?? '未记录'}` : member.operating_scenario === 'WordPress 计算器站' ? `计算器 ${member.wp_calculator_count ?? '未记录'} · 文章 ${member.wp_article_count ?? '未记录'}` : member.operating_scenario === 'WordPress 资讯站' ? `文章 ${member.wp_article_count ?? '未记录'}` : '未记录'
const shortDate = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '未记录'
const dirty = computed(() => baseline.value !== JSON.stringify(form))
const matchesMember = (member: BatchDetail['members'][number]) => { const query = search.value.trim().toLowerCase(); return (!query || `${member.name} ${member.platform}`.toLowerCase().includes(query)) && (!stageFilter.value || member.stage === stageFilter.value) }
const filteredActiveMembers = computed(() => activeMembers.value.filter(matchesMember))
const filteredRemovedMembers = computed(() => (batch.value?.members || []).filter(member => member.membership_status === 'removed').filter(matchesMember))
const allFilteredSelected = computed(() => filteredActiveMembers.value.length > 0 && filteredActiveMembers.value.every(member => selectedIds.has(member.website_id)))
const someFilteredSelected = computed(() => filteredActiveMembers.value.some(member => selectedIds.has(member.website_id)) && !allFilteredSelected.value)
const load = async (force = false) => { loading.value = true; error.value = ''; try { const id = Number(route.params.id); [batch.value, sites.value] = await Promise.all([getBatch(id, force), getWebsites(force)]); if (selectedWebsite.value) selectedWebsite.value = sites.value.find(site => site.id === selectedWebsite.value?.id); Object.assign(form, { name: batch.value.name, source: batch.value.source || '', goal: batch.value.goal || '', hypothesis: batch.value.hypothesis || '', status: batch.value.status, review_conclusion: batch.value.review_conclusion || '', next_action: batch.value.next_action || '' }); baseline.value = JSON.stringify(form); for (const id of [...selectedIds]) if (!activeMembers.value.some(member => member.website_id === id)) selectedIds.delete(id) } catch (e) { error.value = e instanceof Error ? e.message : '批次详情加载失败' } finally { loading.value = false } }
onMounted(() => { void load() }); watch(() => route.params.id, () => { void load(true) })
const back = () => router.push({ name: 'Batches' }); const openSite = (id: number) => { const website = sites.value.find(site => site.id === id); if (website) { selectedWebsite.value = website; websiteDrawerVisible.value = true } }
const save = async () => { if (!batch.value || !dirty.value) return; saving.value = true; try { await updateBatch(batch.value.id, form); batchInfoVisible.value = false; await load(true); ElMessage.success('批次已保存') } catch (e) { ElMessage.error(e instanceof Error ? e.message : '批次保存失败') } finally { saving.value = false } }
const requestReview = async () => { if (!batch.value) return; try { await requestBatchReview(batch.value.id); await load(true); ElMessage.success('已请求复盘') } catch (e) { ElMessage.error(e instanceof Error ? e.message : '请求复盘失败') } }
const completeReview = async () => { if (!batch.value) return; reviewSaving.value = true; try { await completeBatchReview(batch.value.id, reviewForm); reviewVisible.value = false; await load(true); Object.assign(reviewForm, { conclusion: '', next_action: '' }); ElMessage.success('批次复盘已保存') } catch (e) { ElMessage.error(e instanceof Error ? e.message : '复盘保存失败') } finally { reviewSaving.value = false } }
const archive = async () => { if (!batch.value) return; try { await updateBatch(batch.value.id, { status: '已归档' }); await load(true); ElMessage.success('批次已归档') } catch (e) { ElMessage.error(e instanceof Error ? e.message : '批次归档失败') } }
const toggle = (id: number, value: boolean) => value ? selectedIds.add(id) : selectedIds.delete(id)
const toggleFiltered = (value: boolean) => { for (const member of filteredActiveMembers.value) toggle(member.website_id, value) }
const removeSelected = async () => {
  if (!batch.value || !selectedIds.size || memberSaving.value) return
  let reason = '从批次工作台移出'
  try { const result = await ElMessageBox.prompt('可填写一个共同原因，留空使用默认原因。', '批量移出批次', { inputPlaceholder: '例如：改入另一轮实验', inputValue: reason, confirmButtonText: '移出', cancelButtonText: '取消' }); reason = result.value.trim() || reason } catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '批量移出失败'); return }
  memberSaving.value = true
  try { const ids = [...selectedIds]; await removeBatchMembers(batch.value.id, ids, reason); selectedIds.clear(); await load(true); ElMessage.success(`已移出 ${ids.length} 个网站`) } catch (e) { ElMessage.error(e instanceof Error ? e.message : '批量移出失败') } finally { memberSaving.value = false }
}
const remove = async (id: number) => { if (!batch.value) return; try { await removeBatchMembers(batch.value.id, [id], '从批次工作台移出'); await load(true); ElMessage.success('网站已移出批次') } catch (e) { ElMessage.error(e instanceof Error ? e.message : '移出批次失败') } }
const saveBulkNote = async () => { if (!batch.value || !selectedIds.size || bulkSaving.value) return; bulkSaving.value = true; try { await addBatchMembers(batch.value.id, [...selectedIds], bulkNote.value.trim() || undefined); await load(true); ElMessage.success(`已保存 ${selectedIds.size} 个成员备注`) } catch (e) { ElMessage.error(e instanceof Error ? e.message : '成员备注保存失败') } finally { bulkSaving.value = false } }
const applyBulk = async (fields: Record<string, unknown>) => { const ids = [...selectedIds]; if (!ids.length || bulkSaving.value) return; bulkSaving.value = true; try { await bulkUpdateWebsites(ids, fields); selectedIds.clear(); await load(true); ElMessage.success(`已更新 ${ids.length} 个网站`) } catch (e) { ElMessage.error(e instanceof Error ? e.message : '批量更新失败') } finally { bulkSaving.value = false } }
const handleWebsiteChanged = async () => { await load(true) }
const assignMembers = async (payload: BatchAssignmentPayload) => { if (!batch.value || memberSaving.value) return; memberSaving.value = true; try { const result = await assignBatch({ ...payload, batchId: batch.value.id, batch: undefined }); batchAssignmentVisible.value = false; await load(true); ElMessage.success(`已加入 ${result.accepted} 个网站${result.reactivated ? `，重新加入 ${result.reactivated} 个` : ''}`) } catch (e) { ElMessage.error(e instanceof Error ? e.message : '加入批次失败') } finally { memberSaving.value = false } }
</script>
