<template>
  <el-dialog v-model="visible" :title="dialogTitle" :width="isMobile ? '100%' : 'min(980px, 96vw)'" :fullscreen="isMobile" destroy-on-close class="batch-assignment-dialog">
    <div class="batch-assignment-body">
      <div v-if="mode === 'import'" class="batch-assignment-import-hint">
        <strong>导入后的新网站将加入所选批次</strong>
        <p>先选择已有批次，或只填写名称创建一个新批次。网站组合导入完成后会统一建立批次成员关系。</p>
      </div>

      <section v-if="mode !== 'import'" class="batch-assignment-section">
        <div class="batch-assignment-summary"><strong>已选 {{ selectedIds.size }} 个网站</strong><span>只对当前筛选结果执行全选</span></div>
        <div class="batch-assignment-filters">
          <el-input v-model="search" clearable placeholder="搜索网站或域名" aria-label="搜索网站或域名" />
          <el-select v-model="ownership" clearable placeholder="网站归属" aria-label="按网站归属筛选"><el-option v-for="item in ownershipOptions" :key="item" :label="item" :value="item" /></el-select>
          <el-select v-model="platform" clearable placeholder="技术栈" aria-label="按技术栈筛选"><el-option v-for="item in platformOptions" :key="item" :label="item" :value="item" /></el-select>
          <el-select v-model="stage" clearable placeholder="阶段" aria-label="按阶段筛选"><el-option v-for="item in stageOptions" :key="item" :label="item" :value="item" /></el-select>
        </div>
        <div class="batch-assignment-table-wrap">
          <table class="batch-assignment-table">
            <thead><tr><th><el-checkbox :model-value="allFilteredSelected" :indeterminate="someFilteredSelected" aria-label="选择当前筛选结果" @change="toggleFiltered(Boolean($event))" /></th><th>网站 / 域名</th><th>归属</th><th>技术栈</th><th>阶段</th></tr></thead>
            <tbody>
              <tr v-for="site in filteredWebsites" :key="site.id">
                <td><el-checkbox :model-value="selectedIds.has(site.id)" :aria-label="`选择网站：${site.name}`" @change="toggleSite(site.id, Boolean($event))" /></td>
                <td><strong>{{ site.name }}</strong><small>{{ primaryDomain(site) || '未设置域名' }}</small></td>
                <td>{{ site.ownership }}</td><td>{{ platformLabel(site) }}</td><td>{{ site.stage }}</td>
              </tr>
              <tr v-if="!filteredWebsites.length"><td colspan="5" class="batch-assignment-empty">没有符合条件的可加入网站。</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="batch-assignment-section batch-assignment-target">
        <div class="batch-assignment-section-heading"><h3>目标批次</h3></div>
        <el-radio-group v-if="!fixedBatchId" v-model="targetMode" aria-label="批次目标">
          <el-radio-button value="existing">加入已有批次</el-radio-button><el-radio-button value="new">创建并加入新批次</el-radio-button>
        </el-radio-group>
        <div v-if="fixedBatchId" class="batch-assignment-fixed-target">当前批次</div>
        <el-select v-else-if="targetMode === 'existing'" v-model="batchId" filterable placeholder="选择批次" aria-label="选择批次">
          <el-option v-for="batch in activeBatches" :key="batch.id" :label="`${batch.name} · ${batch.status} · ${batch.member_count || 0} 个网站`" :value="batch.id" />
        </el-select>
        <el-input v-else v-model="newBatchName" maxlength="200" placeholder="批次名称" aria-label="批次名称" />
      </section>

      <section class="batch-assignment-section">
        <div class="batch-assignment-section-heading"><h3>批量设置（可选）</h3><span>默认保留网站现有值</span></div>
        <div class="batch-assignment-fields">
          <div class="batch-assignment-field"><el-checkbox v-model="stageEnabled">统一设置阶段</el-checkbox><el-select v-model="stageValue" :disabled="!stageEnabled" placeholder="选择阶段" aria-label="统一设置阶段"><el-option v-for="item in stageOptions" :key="item" :label="item" :value="item" /></el-select></div>
        </div>
        <el-input v-model="memberNote" maxlength="500" placeholder="共同成员备注（可选）" aria-label="共同成员备注" />
      </section>
    </div>
    <template #footer><div class="dialog-footer"><el-button @click="visible = false">取消</el-button><el-button type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">{{ submitLabel }}</el-button></div></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Batch } from '../api/batches'
import type { Website, WebsiteStage } from '../api/websites'

const props = withDefaults(defineProps<{
  modelValue: boolean
  websites: Website[]
  batches: Batch[]
  selectedWebsiteIds?: number[]
  excludeWebsiteIds?: number[]
  fixedBatchId?: number
  mode?: 'assign' | 'import'
  submitting?: boolean
}>(), { selectedWebsiteIds: () => [], excludeWebsiteIds: () => [], mode: 'assign', submitting: false })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: { websiteIds: number[]; batchId?: number; batch?: { name: string }; memberNote?: string; websiteFields?: Record<string, unknown> }]
}>()

const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const isMobile = ref(false)
const search = ref(''); const ownership = ref(''); const platform = ref(''); const stage = ref('')
const targetMode = ref<'existing' | 'new'>('existing'); const batchId = ref<number>(); const newBatchName = ref('')
const stageEnabled = ref(false); const stageValue = ref<WebsiteStage>('待评估'); const memberNote = ref('')
const selectedIds = reactive(new Set<number>())
const stageOptions: WebsiteStage[] = ['待评估', '验证', '增长', '维护', '暂停']
const ownershipOptions = ['未分类', '自营网站', '企业客户网站']
const platformOptions = ['WordPress', 'Astro', 'Next.js', '其他']
const activeBatches = computed(() => props.batches.filter(batch => batch.status !== '已归档'))
const selectableWebsites = computed(() => {
  const excluded = new Set(props.excludeWebsiteIds)
  return props.websites.filter(site => !excluded.has(site.id))
})
const filteredWebsites = computed(() => {
  const query = search.value.trim().toLowerCase()
  return selectableWebsites.value.filter(site => {
    const domainText = site.domains.map(domain => domain.domain).join(' ')
    return (!query || `${site.name} ${domainText}`.toLowerCase().includes(query)) && (!ownership.value || site.ownership === ownership.value) && (!platform.value || site.platform === platform.value) && (!stage.value || site.stage === stage.value)
  })
})
const allFilteredSelected = computed(() => filteredWebsites.value.length > 0 && filteredWebsites.value.every(site => selectedIds.has(site.id)))
const someFilteredSelected = computed(() => filteredWebsites.value.some(site => selectedIds.has(site.id)) && !allFilteredSelected.value)
const dialogTitle = computed(() => props.mode === 'import' ? '选择导入批次' : props.fixedBatchId ? '批量加入当前批次' : '批量加入批次')
const canSubmit = computed(() => (props.mode === 'import' || selectedIds.size > 0) && (targetMode.value === 'existing' ? Boolean(batchId.value) : Boolean(newBatchName.value.trim())))
const submitLabel = computed(() => props.mode === 'import' ? targetMode.value === 'new' ? '创建导入批次' : '使用此批次' : targetMode.value === 'new' ? `创建批次并加入 ${selectedIds.size} 个网站` : `加入批次（${selectedIds.size}）`)
const primaryDomain = (site: Website) => site.domains.find(domain => domain.is_primary)?.domain || site.domains[0]?.domain || ''
const platformLabel = (site: Website) => site.platform === '其他' ? site.platform_other || '其他' : site.platform
const syncMobile = () => { isMobile.value = window.matchMedia('(max-width: 760px)').matches }
const reset = () => {
  selectedIds.clear(); for (const id of props.selectedWebsiteIds) if (!props.excludeWebsiteIds.includes(id)) selectedIds.add(id)
  search.value = ''; ownership.value = ''; platform.value = ''; stage.value = ''
  targetMode.value = props.fixedBatchId ? 'existing' : 'existing'; batchId.value = props.fixedBatchId || undefined; newBatchName.value = ''
  stageEnabled.value = false; stageValue.value = '待评估'; memberNote.value = ''
}
const pruneSelection = () => { const visibleIds = new Set(filteredWebsites.value.map(site => site.id)); for (const id of [...selectedIds]) if (!visibleIds.has(id)) selectedIds.delete(id) }
const toggleSite = (id: number, value: boolean) => value ? selectedIds.add(id) : selectedIds.delete(id)
const toggleFiltered = (value: boolean) => { for (const site of filteredWebsites.value) toggleSite(site.id, value) }
const submit = () => {
  if (!canSubmit.value) return
  const websiteFields: Record<string, unknown> = {}
  if (stageEnabled.value) websiteFields.stage = stageValue.value
  emit('submit', { websiteIds: [...selectedIds], batchId: targetMode.value === 'existing' ? batchId.value : undefined, batch: targetMode.value === 'new' ? { name: newBatchName.value.trim() } : undefined, memberNote: memberNote.value.trim() || undefined, websiteFields })
}
watch(() => props.modelValue, value => { if (value) reset() })
watch(filteredWebsites, pruneSelection)
onMounted(() => { syncMobile(); window.addEventListener('resize', syncMobile) })
onBeforeUnmount(() => window.removeEventListener('resize', syncMobile))
</script>

<style scoped src="../styles/workspace/batch-assignment.css"></style>
