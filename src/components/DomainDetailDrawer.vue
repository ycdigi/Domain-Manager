<template>
  <el-drawer v-model="drawerVisible" size="min(560px, 94vw)" :aria-busy="detailLoading" :close-on-click-modal="!editing" destroy-on-close>
    <template #header>
      <div class="detail-drawer-header">
        <div class="detail-drawer-title"><strong>{{ domain?.domain || '运营详情' }}</strong><span v-if="domain">运营详情</span></div>
        <div v-if="domain" class="detail-drawer-actions">
          <el-button text size="small" :icon="CopyDocument" :title="`复制 ${domain.domain}`" :aria-label="`复制 ${domain.domain}`" @click="copyDomain" />
          <el-button text size="small" :icon="Edit" title="编辑域名信息" aria-label="编辑域名信息" @click="startDomainEdit" />
        </div>
      </div>
    </template>
    <template v-if="domain">
      <div v-if="detailError" class="detail-load-error" role="alert"><span>{{ detailError }}</span><el-button text size="small" @click="loadDetailData">重试</el-button></div>
      <section class="detail-section">
        <div class="section-heading"><h3>基本信息</h3><span class="detail-muted">查看与维护</span></div>
        <div class="detail-grid">
          <div><span>状态</span><strong>{{ domain.status }}</strong></div>
          <div><span>网站名称</span><strong>{{ domain.site_name || '未记录' }}</strong></div>
          <div><span>行业</span><strong>{{ domain.industry || '未记录' }}</strong></div>
          <div><span>资源</span><strong>{{ domain.resource_status || '未关联' }}</strong></div>
          <div><span>注册日期</span><strong>{{ domain.registrar_date || '未记录' }}</strong></div>
          <div><span>到期日期</span><strong>{{ domain.expiry_date || '未记录' }}</strong></div>
          <div><span>最近 SEO</span><strong>{{ domain.seo_last_date || '未记录' }}</strong></div>
          <div><span>点击数据</span><strong>{{ clickRangeLabel(domain.daily_clicks_range, domain.daily_clicks) }}<small v-if="domain.clicks_updated_date"> · {{ domain.clicks_updated_date }}</small></strong></div>
          <div><span>状态检查</span><strong>{{ datePart(domain.last_status_check_at) }}</strong></div>
          <div><span>AdSense</span><strong>{{ domain.adsense_connected || '未知' }}<small v-if="domain.adsense_opened_date"> · {{ domain.adsense_opened_date }}</small></strong></div>
          <div><span>开通耗时</span><strong>{{ domain.adsense_open_days == null ? '未计算' : `${domain.adsense_open_days} 天` }}</strong></div>
          <div><span>技术栈</span><strong>{{ domain.platform === '其他' ? (domain.platform_other || '其他') : domain.platform }}</strong></div>
        </div>
        <div class="detail-line"><span>AdSense账号</span><p>{{ domain.adsense_account_name || '未关联' }} · {{ domain.adsense_owner || '未记录' }} · {{ domain.adsense_publisher_id || '未记录 Publisher ID' }}</p></div>
        <div class="detail-line"><span>WordPress统计</span><p v-if="domain.platform === 'WordPress'">计算器 {{ domain.wp_calculator_count ?? '未记录' }} 个 · 文章 {{ domain.wp_article_count ?? '未记录' }} 篇 · {{ domain.content_stats_updated_date || '未记录统计日期' }}</p><p v-else>不适用</p></div>
        <div class="detail-line"><span>部署资源</span><p>{{ domain.resource_names || '未关联' }}</p></div>
        <div v-if="resources.length" class="detail-resource-list"><div v-for="resource in resources" :key="resource.id" class="detail-resource"><strong>{{ resource.provider }} · {{ resource.resource_name }}<small v-if="resource.is_primary">主资源</small></strong><span>{{ resource.account_name || '未关联账号' }} · {{ resource.login_email || '未记录邮箱' }}</span><span>{{ resource.resource_url || resource.ip_address || '未记录地址' }}<template v-if="resource.port">:{{ resource.port }}</template></span></div></div>
        <div class="detail-line"><span>备注</span><p>{{ domain.memo || '未记录' }}</p></div>
      </section>

      <section v-if="qualityIssues.length" class="detail-section quality-section">
        <div class="section-heading"><h3>信息待补全</h3><span class="detail-muted">{{ qualityIssues.length }} 项</span></div>
        <ul><li v-for="issue in qualityIssues" :key="issue">{{ issue }}</li></ul>
      </section>

      <section class="detail-section">
        <div class="section-heading"><h3>操作日期</h3><span class="detail-muted">最近：{{ domain.latest_operation_date || '未记录' }}</span></div>
        <div class="operation-form"><el-date-picker v-model="operationForm.operation_date" type="date" value-format="YYYY-MM-DD" /><el-select v-model="operationForm.operation_kind"><el-option v-for="kind in operationKinds" :key="kind" :label="kind" :value="kind" /></el-select><el-button type="primary" @click="saveOperation">记录</el-button></div>
        <div class="operation-quick"><el-button v-for="kind in operationKinds" :key="kind" text size="small" @click="recordToday(kind)">今天 {{ kind }}</el-button></div>
        <el-select v-model="operationFilter" class="operation-filter"><el-option label="全部类型" value="全部" /><el-option v-for="kind in operationKinds" :key="`filter-${kind}`" :label="kind" :value="kind" /></el-select>
        <div v-if="filteredOperations.length" class="operation-list"><div v-for="operation in filteredOperations" :key="operation.id" class="operation-row"><span>{{ operation.operation_date }} · {{ operation.operation_kind }}</span><el-button text size="small" type="danger" @click="removeOperation(operation)">删除</el-button></div></div>
        <p v-else class="detail-empty">还没有操作日期。</p>
      </section>

      <section class="detail-section">
        <div class="section-heading"><h3>AI 提示与想法</h3><el-button type="primary" size="small" @click="startCreate">新增记录</el-button></div>
        <div v-if="notes.length" class="note-list">
          <article v-for="note in notes" :key="note.id" class="note-card">
            <div class="note-meta"><span class="note-kind">{{ note.kind }}</span><span>更新于 {{ datePart(note.updated_at) }}</span></div>
            <p class="note-content">{{ note.content }}</p>
            <div class="note-actions">
              <el-button text size="small" @click="copyNote(note.content)">复制</el-button>
              <el-button text size="small" @click="startEdit(note)">编辑</el-button>
              <el-button text size="small" @click="showHistory(note)">历史</el-button>
              <el-button text size="small" type="danger" @click="archiveNote(note)">归档</el-button>
            </div>
          </article>
        </div>
        <p v-else class="detail-empty">还没有 AI 提示或想法。</p>
      </section>

      <el-form v-if="editing" :model="noteForm" label-position="top" class="note-form">
        <el-form-item label="类型"><el-select v-model="noteForm.kind"><el-option label="AI提示词" value="AI提示词" /><el-option label="想法说明" value="想法说明" /></el-select></el-form-item>
        <el-form-item label="内容"><el-input v-model="noteForm.content" type="textarea" :rows="8" maxlength="20000" show-word-limit placeholder="输入要发送给 AI 的提示词，或记录你的判断和想法" /></el-form-item>
        <div class="note-form-actions"><el-button @click="editing = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveNote">保存</el-button></div>
      </el-form>

      <el-dialog v-model="historyVisible" :title="domain?.domain ? `修改历史 · ${domain.domain}` : '修改历史'" width="460px" append-to-body>
        <div v-if="history.length" class="history-list">
          <article v-for="version in history" :key="version.id" class="history-item"><div><strong>版本 {{ version.version_no }}</strong><span>{{ datePart(version.created_at) }}</span></div><p>{{ version.content }}</p></article>
        </div>
        <p v-else class="detail-empty">暂无历史版本。</p>
      </el-dialog>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Edit } from '@element-plus/icons-vue'
import { api } from '../utils/request'
import { getWriteQueue } from '../utils/writeQueue'
import { confirmAction, isDismissed } from '../utils/feedback'
import { copyText } from '../utils/clipboard'
import type { DomainData } from '../api/domains'

type NoteKind = 'AI提示词' | '想法说明'
interface Note { id: number; domain_id: number; kind: NoteKind; content: string; updated_at?: string; version_count?: number }
interface Version { id: number; note_id: number; kind: NoteKind; content: string; version_no: number; created_at?: string }
interface Operation { id: number; domain_id: number; operation_date: string; operation_kind: 'SEO' | '内容' | '技术' | '其他'; created_at?: string }
interface ResourceLink { id: number; provider: string; resource_name: string; resource_url?: string | null; ip_address?: string | null; port?: number | null; account_name?: string | null; login_email?: string | null; role: string; is_primary: number }
const props = defineProps<{ visible: boolean; domain?: DomainData }>()
const emit = defineEmits<{ (event: 'update:visible', value: boolean): void; (event: 'changed'): void; (event: 'edit', domain: DomainData): void }>()
const drawerVisible = computed({ get: () => props.visible, set: value => emit('update:visible', value) })
const notes = ref<Note[]>([])
const editing = ref(false)
const saving = ref(false)
const noteForm = ref<{ id?: number; kind: NoteKind; content: string }>({ kind: 'AI提示词', content: '' })
const historyVisible = ref(false)
const history = ref<Version[]>([])
const operations = ref<Operation[]>([])
const resources = ref<ResourceLink[]>([])
const detailError = ref('')
const detailLoading = ref(false)
const operationKinds = ['SEO', '内容', '技术', '其他'] as const
const operationForm = ref<{ operation_date: string; operation_kind: Operation['operation_kind'] }>({ operation_date: '', operation_kind: 'SEO' })
const queue = getWriteQueue()
const operationFilter = ref<'全部' | Operation['operation_kind']>('全部')
const filteredOperations = computed(() => operationFilter.value === '全部' ? operations.value : operations.value.filter(operation => operation.operation_kind === operationFilter.value))
const qualityIssues = computed(() => {
  if (!props.domain) return []
  const issues: string[] = []
  if (props.domain.adsense_connected === '已开通' && !props.domain.adsense_account_id) issues.push('已开通 AdSense，但没有关联账号')
  if (props.domain.adsense_connected === '已开通' && !props.domain.adsense_opened_date) issues.push('已开通 AdSense，但没有开通日期')
  if (props.domain.adsense_account_id && !props.domain.adsense_publisher_id) issues.push('关联账号还没有 Publisher ID')
  if (props.domain.platform === 'WordPress' && (props.domain.wp_calculator_count == null || props.domain.wp_article_count == null || !props.domain.content_stats_updated_date)) issues.push('WordPress 内容数量或统计日期未完整记录')
  if (!props.domain.resource_count) issues.push('还没有关联部署资源')
  if (resources.value.length && !resources.value.some(resource => resource.is_primary)) issues.push('尚未设置主部署资源')
  if ((props.domain.daily_clicks != null || props.domain.daily_clicks_range) && !props.domain.clicks_updated_date) issues.push('日点击量缺少更新时间')
  if (!props.domain.latest_operation_date) issues.push('还没有操作日期记录')
  return issues
})
const datePart = (value?: string | null) => value ? value.slice(0, 16).replace('T', ' ') : '未记录'
const clickRangeLabel = (range?: string | null, value?: number | null) => ({ under10: '10 次以下', '10to29': '10–29 次', '30to49': '30–49 次', '50to99': '50–99 次', over100: '100 次以上' }[range || ''] || (value == null ? '未填写' : `${value} 次`))
const copyDomain = async () => { if (!props.domain?.domain) return; try { await copyText(props.domain.domain); ElMessage.success(`已复制域名：${props.domain.domain}`) } catch { ElMessage.error('复制失败，请手动复制') } }
const startDomainEdit = () => { if (props.domain) emit('edit', props.domain) }
const loadNotes = async () => { if (!props.domain?.id) return; notes.value = await api.get(`/api/domains/${props.domain.id}/ai-notes`) }
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const loadOperations = async () => { if (!props.domain?.id) return; [operations.value, resources.value] = await Promise.all([api.get<Operation[]>(`/api/domains/${props.domain.id}/operations`), api.get<ResourceLink[]>(`/api/resources/links?domain_id=${props.domain.id}`)]) }
const loadDetailData = async () => {
  if (!props.domain?.id) return
  detailLoading.value = true
  detailError.value = ''
  notes.value = []
  operations.value = []
  resources.value = []
  const results = await Promise.allSettled([loadNotes(), loadOperations()])
  if (results.some(result => result.status === 'rejected')) detailError.value = '详情数据未能完整加载，基础信息仍可查看。'
  detailLoading.value = false
}
const saveOperation = async () => { if (!props.domain?.id || !operationForm.value.operation_date) { ElMessage.warning('请选择操作日期'); return }; try { queue.enqueue({ type: 'domain_operation_add', domain_id: props.domain.id, operation_date: operationForm.value.operation_date, operation_kind: operationForm.value.operation_kind }); await queue.flush(); await loadOperations(); emit('changed'); ElMessage.success('操作日期已记录') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '操作日期已加入待同步队列') } }
const recordToday = (kind: Operation['operation_kind']) => { operationForm.value = { operation_date: localDate(), operation_kind: kind }; void saveOperation() }
const removeOperation = async (operation: Operation) => { try { await confirmAction(`删除“${props.domain?.domain || '当前网站'}”的 ${operation.operation_date} · ${operation.operation_kind} 操作记录？`, `删除操作记录 · ${props.domain?.domain || '当前网站'}`, { confirmButtonText: '删除' }); await api.delete(`/api/domains/${props.domain?.id}/operations/${operation.id}`); await loadOperations(); emit('changed') } catch (error) { if (!isDismissed(error)) ElMessage.error(error instanceof Error ? error.message : '删除操作记录失败') } }
const startCreate = () => { noteForm.value = { kind: 'AI提示词', content: '' }; editing.value = true }
const startEdit = (note: Note) => { noteForm.value = { id: note.id, kind: note.kind, content: note.content }; editing.value = true }
const saveNote = async () => {
  if (!props.domain?.id || !noteForm.value.content.trim()) { ElMessage.warning('请输入内容'); return }
  saving.value = true
  try {
    const id = noteForm.value.id
    await (id ? api.put(`/api/domains/${props.domain.id}/ai-notes/${id}`, { kind: noteForm.value.kind, content: noteForm.value.content }) : api.post(`/api/domains/${props.domain.id}/ai-notes`, { kind: noteForm.value.kind, content: noteForm.value.content }))
    editing.value = false; await loadNotes(); emit('changed'); ElMessage.success('记录已保存')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') } finally { saving.value = false }
}
const archiveNote = async (note: Note) => {
  if (!props.domain?.id || !note.id) return
  try { await confirmAction(`归档“${props.domain.domain}”的这条${note.kind}记录？归档后首页不再计入当前提示数量，但修改历史仍会保留。`, `归档记录 · ${props.domain.domain}`, { confirmButtonText: '归档' }); await api.post(`/api/domains/${props.domain.id}/ai-notes/${note.id}`); await loadNotes(); emit('changed') } catch (error) { if (!isDismissed(error)) ElMessage.error(error instanceof Error ? error.message : '归档失败') }
}
const showHistory = async (note: Note) => { if (!props.domain?.id || !note.id) return; try { history.value = await api.get<Version[]>(`/api/domains/${props.domain.id}/ai-notes/${note.id}/history`); historyVisible.value = true } catch (error) { ElMessage.error(error instanceof Error ? error.message : '历史读取失败') } }
const copyNote = async (content: string) => { try { await copyText(content); ElMessage.success('已复制') } catch { ElMessage.error('复制失败，请手动选择文本') } }
watch(() => [props.visible, props.domain?.id], ([visible]) => { if (visible) { editing.value = false; operationFilter.value = '全部'; operationForm.value = { operation_date: localDate(), operation_kind: 'SEO' }; void loadDetailData() } })
</script>

<style scoped src="../styles/dialogs/domain-detail.css"></style>
