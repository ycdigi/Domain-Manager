<template>
  <el-drawer v-model="visible" class="website-detail-drawer" :size="drawerSize" :title="website?.name || '网站详情'" :before-close="beforeClose" destroy-on-close>
    <template v-if="website">
      <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="loadAll">重试</el-button></div>
      <div class="portfolio-detail-heading"><span v-if="profileDirty">有未保存资料</span><el-button type="primary" :disabled="!profileDirty" :loading="saving" @click="saveProfile">保存</el-button></div>
      <el-tabs v-model="activeSection" class="website-sections">
        <el-tab-pane label="基本资料" name="basic" lazy><div v-loading="sectionLoading.basic"><el-form label-position="top" class="portfolio-detail-grid">
<el-form-item label="网站名称"><el-input v-model="profile.name" maxlength="200" /></el-form-item>
<el-form-item label="阶段"><el-select v-model="profile.stage"><el-option v-for="stage in stages" :key="stage" :label="stage" :value="stage" /></el-select></el-form-item>
<el-form-item label="新站分类"><el-select v-model="profile.new_site_mode"><el-option label="自动判断" value="auto" /><el-option label="手动标记为新站" value="new" /><el-option label="手动设为普通站" value="regular" /></el-select></el-form-item>
<el-form-item label="状态"><el-select v-model="profile.lifecycle"><el-option label="经营中" value="active" /><el-option label="停止经营" value="stopped" /></el-select></el-form-item>
<el-form-item label="网站归属"><el-select v-model="profile.ownership"><el-option v-for="item in ownerships" :key="item" :label="item" :value="item" /></el-select></el-form-item>
<el-form-item label="技术栈"><el-select v-model="profile.platform"><el-option v-for="item in platforms" :key="item" :label="item" :value="item" /></el-select></el-form-item>
<el-form-item label="网站类型"><el-select v-model="profile.industry" clearable placeholder="未设置"><el-option v-for="item in industries" :key="item" :label="item" :value="item" /></el-select></el-form-item>
<el-form-item label="主要管理电脑"><el-select v-model="profile.computer_name" filterable allow-create clearable default-first-option><template #label><ComputerIdentity v-if="profile.computer_name" :name="profile.computer_name" /></template><el-option v-for="name in computerNames" :key="name" :label="name" :value="name"><ComputerIdentity :name="name" /></el-option></el-select></el-form-item>
<el-form-item v-if="profile.platform === '其他'" label="其他技术栈"><el-input v-model="profile.platform_other" maxlength="100" /></el-form-item>
</el-form><section class="portfolio-detail-section"><div class="portfolio-detail-heading"><h2>网站图标</h2><el-button :loading="refreshingIcon" @click="refreshIcon">刷新图标</el-button></div><DomainFavicon :domain-id="domains.find(d=>d.is_primary)?.id" :revision="iconRevision" /><p class="page-muted">使用已保存的图标，刷新列表不会重复获取。</p></section></div></el-tab-pane>
        <el-tab-pane label="内容与点击" name="content" lazy><div v-loading="sectionLoading.content"><el-form label-position="top" class="portfolio-detail-grid">
<el-form-item label="GSC"><el-select v-model="profile.gsc_connected"><el-option v-for="item in serviceStates" :key="item" :label="item" :value="item" /></el-select></el-form-item>
<el-form-item label="日点击量"><el-input-number v-model="profile.daily_clicks" :min="0" :precision="0" :controls="false" @change="profile.daily_clicks_range = ''" /></el-form-item>
<el-form-item label="日点击区间"><el-select v-model="profile.daily_clicks_range" clearable placeholder="未记录" @change="clearExactClicks"><el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" /></el-select></el-form-item>
<el-form-item label="点击数据日期"><el-date-picker v-model="profile.clicks_updated_date" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
<el-form-item label="总页面数"><el-input-number v-model="profile.page_count" :min="0" :precision="0" :controls="false" /></el-form-item>
<el-form-item label="计算器数量"><el-input-number v-model="profile.calculator_count" :min="0" :precision="0" :controls="false" /></el-form-item>
<el-form-item label="文章数量"><el-input-number v-model="profile.article_count" :min="0" :precision="0" :controls="false" /></el-form-item>
<el-form-item label="内容统计日期"><el-date-picker v-model="profile.content_stats_updated_date" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
</el-form></div></el-tab-pane>
        <el-tab-pane label="部署与账号" name="deployment" lazy><div v-loading="sectionLoading.deployment"><WebsiteDeployment ref="deploymentPanel" :key="website.id" :website="website" @changed="notifyChanged" /></div></el-tab-pane>
        <el-tab-pane label="域名" name="domains" lazy><div v-loading="sectionLoading.domains"><section class="portfolio-detail-section">
        <div class="portfolio-detail-heading"><h2>域名</h2><span>{{ domains.length }} 个</span></div>
        <div v-for="domain in domains" :key="domain.id" class="portfolio-detail-row">
          <div><strong>{{ domain.domain }}</strong><small>{{ domain.domain_role }} · {{ domain.registrar }} · 到期 {{ domain.expiry_date }} · {{ domain.status }}<template v-if="domain.last_status_check_at"> · 检查 {{ domain.last_status_check_at.slice(0, 10) }}</template></small></div>
          <el-button v-if="!domain.is_primary" text @click="setPrimary(domain)">设为主域名</el-button>
          <el-button text :loading="checkingDomainId === domain.id" :aria-label="`检查域名 ${domain.domain}`" @click="checkDomain(domain)">检查</el-button>
          <el-button text type="danger" :disabled="domains.length <= 1" :aria-label="`删除域名 ${domain.domain}`" @click="removeDomain(domain.id)"><Delete /></el-button>
        </div>
        <el-form class="portfolio-domain-add" label-position="top" @submit.prevent="addDomain">
          <el-input v-model="domainForm.domain" placeholder="新增域名" aria-label="新增域名" />
          <el-input v-model="domainForm.registrar" placeholder="注册商" aria-label="注册商" />
          <el-date-picker v-model="domainForm.registrar_date" type="date" value-format="YYYY-MM-DD" placeholder="注册日期" aria-label="注册日期" />
          <el-date-picker v-model="domainForm.expiry_date" type="date" value-format="YYYY-MM-DD" placeholder="到期日期" aria-label="到期日期" />
          <el-button type="primary" :loading="savingDomain" native-type="submit">关联域名</el-button>
        </el-form>
      </section></div></el-tab-pane>
        <el-tab-pane label="任务与记录" name="work" lazy><div v-loading="sectionLoading.work"><el-form label-position="top" class="portfolio-detail-grid">
<el-form-item class="portfolio-detail-full" label="潜力判断"><el-input v-model="profile.potential" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
<el-form-item label="当前下一步"><el-input v-model="profile.next_action" maxlength="300" /></el-form-item>
<el-form-item label="截止日期"><el-date-picker v-model="profile.next_action_due_date" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
<el-form-item label="下一步状态"><el-select v-model="profile.next_action_status"><el-option label="待做" value="待做" /><el-option label="处理中" value="处理中" /><el-option label="已完成" value="已完成" /></el-select></el-form-item>
</el-form><section class="portfolio-detail-section">
        <div class="portfolio-detail-heading"><h2>网站任务</h2><span>{{ tasks.length }} 项</span></div>
        <form class="portfolio-task-form" @submit.prevent="addTask">
          <el-input v-model="taskForm.title" maxlength="200" placeholder="任务标题" aria-label="任务标题" />
          <el-select v-model="taskForm.task_type" aria-label="任务分类"><el-option v-for="kind in taskTypes" :key="kind" :label="kind" :value="kind" /></el-select>
          <el-button type="primary" :loading="savingTask" native-type="submit">添加任务</el-button>
          <el-input v-model="taskForm.description" class="portfolio-detail-full" type="textarea" :rows="2" maxlength="5000" placeholder="任务说明（可选）" />
          <template v-if="taskForm.task_type === 'SEO'">
            <el-form-item label="复查等待天数（至少 28 天）"><el-input-number v-model="taskForm.review_delay_days" :min="28" :max="3650" :precision="0" /></el-form-item>
            <el-form-item label="点击对比窗口天数"><el-input-number v-model="taskForm.review_window_days" :min="1" :max="365" :precision="0" /></el-form-item>
            <el-date-picker v-model="baselineRange" class="portfolio-detail-full" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="修改前开始" end-placeholder="修改前结束" />
            <el-input-number v-model="baselineClicks" :min="0" :precision="0" :controls="false" placeholder="修改前 GSC 点击数（可选）" aria-label="修改前 GSC 点击数" />
          </template>
        </form>
        <div v-if="tasks.length" class="portfolio-task-list">
          <article v-for="task in tasks" :key="task.id" class="portfolio-task-row">
            <div class="portfolio-task-main"><div class="portfolio-task-title"><strong>{{ task.title }}</strong><span>{{ task.task_type }}</span></div><p v-if="task.description">{{ task.description }}</p><p v-if="task.completion_summary">{{ task.completion_summary }}</p><a v-if="task.result_url" :href="task.result_url" target="_blank" rel="noopener noreferrer">查看结果</a><small v-if="task.due_at">{{ task.task_type === 'SEO复查' ? '复查日期' : '截止日期' }} {{ task.due_at }}<template v-if="task.review_conclusion"> · {{ task.review_conclusion }}</template></small><p v-if="task.review_basis">判断依据：{{ task.review_basis }}</p><small v-if="task.baseline_missing">缺少修改前点击基线</small><small v-for="snapshot in task.snapshots || []" :key="snapshot.period_kind">{{ snapshot.period_kind === 'before' ? '修改前' : '复查' }}：{{ snapshot.period_start }} 至 {{ snapshot.period_end }} · {{ snapshot.clicks }} 次点击</small></div>
            <div class="portfolio-task-controls"><el-select v-if="task.task_type !== 'SEO复查'" :model-value="task.status" :aria-label="`${task.title} 状态`" @change="value => updateTask(task, { status: value })"><el-option label="待做" value="待做" /><el-option label="处理中" value="处理中" /><el-option label="已完成" value="已完成" /></el-select>
              <el-tag v-else :type="task.status === '待跟进' ? 'warning' : 'info'">{{ task.status }}</el-tag>
              <el-button text :aria-label="`编辑任务 ${task.title}`" @click="editTask(task)">编辑</el-button>
              <el-button v-if="task.task_type !== 'SEO复查'" text type="danger" :aria-label="`删除任务 ${task.title}`" @click="removeTask(task)"><Delete /></el-button>
            </div>
          </article>
        </div>
        <p v-else class="portfolio-empty">还没有任务。</p>
      </section><section class="portfolio-detail-section">
        <div class="portfolio-detail-heading"><h2>工作登记</h2><router-link :to="{name:'WebsiteManagement',query:{q:website.name}}">查看网站管理</router-link></div><WebsiteWorkHistory v-if="visible && activeSection==='work'" :key="website.id" :website-id="website.id" @busy="workHistoryBusy=$event" @changed="notifyChanged" /></section><section class="portfolio-detail-section">
        <div class="portfolio-detail-heading"><h2>操作记录</h2><span>{{ operations.length }} 条</span></div>
        <form class="portfolio-operation-form" @submit.prevent="addOperation"><el-date-picker v-model="operationForm.operation_date" type="date" value-format="YYYY-MM-DD" aria-label="操作日期" /><el-select v-model="operationForm.operation_kind" aria-label="操作类型"><el-option v-for="kind in taskTypes" :key="kind" :label="kind" :value="kind" /></el-select><el-button type="primary" :loading="savingOperation" native-type="submit">记录操作</el-button></form>
        <div v-for="operation in operations" :key="operation.id" class="portfolio-detail-row"><span>{{ operation.operation_date }} · {{ operation.operation_kind }}</span><el-button text type="danger" :aria-label="`删除 ${operation.operation_date} ${operation.operation_kind} 操作`" @click="removeOperation(operation)"><Delete /></el-button></div>
        <p v-if="!operations.length" class="portfolio-empty">还没有操作记录。</p>
      </section><section class="portfolio-detail-section">
        <div class="portfolio-detail-heading"><h2>AI 提示词与想法</h2><el-button type="primary" @click="editNote()">新增记录</el-button></div>
        <article v-for="item in notes" :key="item.id" class="portfolio-note-row">
          <header><div><strong>{{ item.kind }}</strong><small>更新于 {{ item.updated_at || item.created_at || '未知' }} · {{ item.version_count || 1 }} 个版本</small></div><div class="portfolio-task-controls"><el-button text @click="editNote(item)">编辑</el-button><el-button text @click="showNoteHistory(item)">历史</el-button><el-button text type="danger" @click="archiveNote(item)">归档</el-button></div></header>
          <pre>{{ item.content }}</pre>
        </article>
        <p v-if="!notes.length" class="portfolio-empty">还没有 AI 提示词或想法记录。</p>
      </section></div></el-tab-pane>
        <el-tab-pane label="收入与投入" name="finance" lazy><div v-loading="sectionLoading.finance"><el-form label-position="top" class="portfolio-detail-grid">
<el-form-item label="AdSense"><el-select v-model="profile.adsense_connected"><el-option v-for="item in serviceStates" :key="item" :label="item" :value="item" /></el-select></el-form-item>
<el-form-item v-if="profile.adsense_connected === '已开通' || profile.adsense_account_id" label="AdSense 账号"><el-select v-model="profile.adsense_account_id" clearable placeholder="请选择账号"><el-option v-for="account in adsenseAccounts" :key="account.id" :label="account.name" :value="account.id" /></el-select></el-form-item>
<el-form-item v-if="profile.adsense_connected === '已开通' || profile.adsense_opened_date" label="开通日期"><el-date-picker v-model="profile.adsense_opened_date" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
</el-form><section class="portfolio-detail-section">
        <div class="portfolio-detail-heading"><h2>收入与投入</h2><span>不跨币种合计</span></div>
        <div class="portfolio-income-effort-grid">
          <div>
            <h3>月收入</h3>
            <form class="portfolio-income-form" @submit.prevent="saveIncome"><el-date-picker v-model="incomeForm.income_month" type="month" value-format="YYYY-MM" placeholder="月份" aria-label="收入月份" /><el-input v-model="incomeForm.source" placeholder="来源" aria-label="收入来源" /><el-input v-model="incomeForm.currency" maxlength="3" placeholder="币种" aria-label="收入币种" /><el-input-number v-model="incomeForm.amount" :min="0" :precision="2" :step="0.01" :controls="false" aria-label="收入金额" /><el-button type="primary" :loading="savingIncome" native-type="submit">记录</el-button></form>
            <div v-for="item in incomes" :key="`${item.income_month}-${item.source}-${item.currency}`" class="portfolio-detail-row"><span>{{ item.income_month }} · {{ item.source }} · {{ item.currency }}<template v-if="item.origin === 'adsense_account'"> · 账号收入</template></span><strong>{{ Number(item.amount).toFixed(2) }}</strong></div>
          </div>
          <div>
            <h3>每周投入</h3>
            <form class="portfolio-effort-form" @submit.prevent="saveEffort"><el-date-picker v-model="effortForm.week_start" type="date" value-format="YYYY-MM-DD" placeholder="周一" aria-label="周起始日期" /><el-input-number v-model="effortForm.hours" :min="0" :max="168" :precision="1" :step="0.1" :controls="false" aria-label="投入小时数" /><el-button type="primary" :loading="savingEffort" native-type="submit">记录</el-button></form>
            <div v-for="item in efforts" :key="item.id" class="portfolio-detail-row"><span>{{ item.week_start }} 起</span><strong>{{ Number(item.hours).toFixed(1) }} 小时</strong></div>
          </div>
        </div>
      </section></div></el-tab-pane>
        <el-tab-pane label="监控" name="monitor" lazy><div v-loading="sectionLoading.monitor"><WebsiteMonitorPanel v-if="visible" :key="website.id" ref="monitorPanel" :website-id="website.id" /></div></el-tab-pane>
      </el-tabs>
    </template>
  </el-drawer>
  <el-dialog v-model="taskDialogVisible" title="编辑网站任务" :before-close="closeTask" width="min(620px, 94vw)" append-to-body>
    <el-form label-position="top" @submit.prevent="saveTaskEdit">
      <el-form-item label="标题"><el-input v-model="taskEdit.title" maxlength="200" /></el-form-item>
      <el-form-item label="说明"><el-input v-model="taskEdit.description" type="textarea" :rows="3" maxlength="5000" /></el-form-item>
      <el-form-item label="完成摘要"><el-input v-model="taskEdit.completion_summary" type="textarea" :rows="3" maxlength="5000" /></el-form-item>
      <el-form-item label="结果链接"><el-input v-model="taskEdit.result_url" maxlength="2000" placeholder="https://" /></el-form-item>
      <el-form-item label="截止或复查日期"><el-date-picker v-model="taskEdit.due_at" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
      <template v-if="editingTask?.task_type === 'SEO' && !editingTask.completed_at">
        <el-form-item label="复查等待天数"><el-input-number v-model="taskEdit.review_delay_days" :min="28" :max="3650" :precision="0" /></el-form-item>
        <el-form-item label="点击窗口天数"><el-input-number v-model="taskEdit.review_window_days" :min="1" :max="365" :precision="0" /></el-form-item>
      </template>
    </el-form>
    <template #footer><div class="dialog-footer"><el-button @click="closeTask(() => taskDialogVisible = false)">取消</el-button><el-button type="primary" :loading="savingTask" @click="saveTaskEdit">保存任务</el-button></div></template>
  </el-dialog>
  <el-dialog v-model="noteDialogVisible" :before-close="closeNote" :title="editingNoteId ? '编辑记录' : '新增记录'" width="min(680px, 94vw)" append-to-body>
    <el-form label-position="top"><el-form-item label="类型"><el-select v-model="noteForm.kind"><el-option label="AI提示词" value="AI提示词" /><el-option label="想法说明" value="想法说明" /></el-select></el-form-item><el-form-item label="内容"><el-input v-model="noteForm.content" type="textarea" :rows="12" maxlength="20000" show-word-limit /></el-form-item></el-form>
    <template #footer><div class="dialog-footer"><el-button @click="closeNote(() => noteDialogVisible = false)">取消</el-button><el-button type="primary" :loading="savingNote" @click="saveNote">保存</el-button></div></template>
  </el-dialog>
  <el-dialog v-model="historyVisible" title="记录历史" width="min(680px, 94vw)" append-to-body>
    <ol class="portfolio-note-history"><li v-for="version in noteHistory" :key="version.id"><strong>第 {{ version.version_no }} 版 · {{ version.created_at }}</strong><pre>{{ version.content }}</pre></li></ol>
  </el-dialog>
</template>

<script setup lang="ts">
import { websiteEditPatch } from '../../shared/website-edits'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { websiteQuery, websiteSections, type WebsiteSection } from '../utils/website-location'
import { ElMessage } from 'element-plus'
import DomainFavicon from './DomainFavicon.vue'
import ComputerIdentity from './ComputerIdentity.vue'
import WebsiteDeployment from './WebsiteDeployment.vue'
import { sortComputerNames } from '../utils/computer-options'
import WebsiteWorkHistory from './WebsiteWorkHistory.vue'
import WebsiteMonitorPanel from './WebsiteMonitorPanel.vue'
import { Delete } from '@element-plus/icons-vue'
import { api } from '../utils/request'
import { invalidateData } from '../utils/workspaceCache'
import { getWriteQueue } from '../utils/writeQueue'
import { createWebsiteSession } from '../composables/websiteSession'
import { useUnsavedChanges, confirmDiscard } from '../composables/useUnsavedChanges'
import { confirmAction, isDismissed } from '../utils/feedback'
import type { Website, WebsiteDomain, WebsiteTask, WebsiteTaskType } from '../api/websites'

interface IncomeRow { id?: number | null; income_month: string; source: string; currency: string; amount: number; origin?: 'website' | 'adsense_account' }
interface EffortRow { id: number; week_start: string; hours: number }
interface OperationRow { id: number; operation_date: string; operation_kind: string }
interface AiNote { id: number; kind: 'AI提示词' | '想法说明'; content: string; created_at?: string; updated_at?: string; version_count?: number }
interface NoteVersion { id: number; version_no: number; content: string; created_at: string }
const props = defineProps<{ visible: boolean; website?: Website }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; changed: [] }>()
const route = useRoute(); const router = useRouter()
const activeSection = computed<WebsiteSection>({ get: () => websiteSections.some(item => item.key === route.query.section) ? route.query.section as WebsiteSection : 'basic', set: section => { if (props.website) void router.replace({ query: websiteQuery(props.website.id, section, route.query) }) } })
const session = createWebsiteSession()
const sectionLoading = session.loading
const sectionErrors = session.errors
const queue = getWriteQueue()
const visible = computed({ get: () => props.visible, set: value => emit('update:visible', value) })
const drawerSize = ref('760px')
const updateDrawerSize = () => { drawerSize.value = `${Math.max(320, Math.min(760, Math.floor(window.innerWidth * 0.96)))}px` }
const stages = ['待评估', '验证', '增长', '维护', '暂停']
const ownerships = ['未分类', '自营网站', '企业客户网站']
const platforms = ['WordPress', 'Astro', 'Next.js', '其他']
const industries = ['计算器', '资讯站', '其他']
const serviceStates = ['未知', '已开通', '未开通']
const taskTypes: WebsiteTaskType[] = ['SEO', '内容', '技术', '其他']
const profile = reactive<{ name: string; stage: string; new_site_mode: 'auto' | 'new' | 'regular'; lifecycle: string; ownership: string; platform: string; platform_other: string; industry: string; computer_name: string; page_count?: number; adsense_connected: string; adsense_account_id?: number; adsense_opened_date: string; gsc_connected: string; daily_clicks?: number; daily_clicks_range: string; clicks_updated_date: string; calculator_count?: number; article_count?: number; content_stats_updated_date: string; potential: string; next_action: string; next_action_due_date: string; next_action_status: string }>({ name: '', stage: '待评估', new_site_mode: 'auto', lifecycle: 'active', ownership: '自营网站', platform: '其他', platform_other: '', industry: '', computer_name: '', page_count: undefined, adsense_connected: '未知', adsense_account_id: undefined, adsense_opened_date: '', gsc_connected: '未知', daily_clicks: undefined, daily_clicks_range: '', clicks_updated_date: '', calculator_count: undefined, article_count: undefined, content_stats_updated_date: '', potential: '', next_action: '', next_action_due_date: '', next_action_status: '待做' })
const adsenseAccounts = ref<Array<{ id: number; name: string }>>([])
const domains = ref<WebsiteDomain[]>([])
const computerNames=computed(()=>sortComputerNames([profile.computer_name]))
const refreshingIcon=computed(() => Boolean(session.saving.icon));const iconRevision=ref(0)
const refreshIcon = async () => {
  const id = domains.value.find(domain => domain.is_primary)?.id
  if (!id) return
  try { await session.save('icon', () => api.post<{status: string; last_error?: string}>(`/api/domains/${id}/favicon`, {}), result => { iconRevision.value++; if (result.last_error) ElMessage.warning(result.last_error); else ElMessage.success('图标已更新') }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '图标刷新失败') }
}

const tasks = ref<WebsiteTask[]>([])
const incomes = ref<IncomeRow[]>([])
const efforts = ref<EffortRow[]>([])
const operations = ref<OperationRow[]>([])
const notes = ref<AiNote[]>([])
const noteHistory = ref<NoteVersion[]>([])
const error = computed(() => sectionErrors[activeSection.value] || '')
const saving = computed(() => Boolean(session.saving.profile))
const savingDomain = computed(() => Boolean(session.saving.domain))
const savingTask = computed(() => Boolean(session.saving.task || session.saving['task-edit']))
const savingIncome = computed(() => Boolean(session.saving.income))
const savingEffort = computed(() => Boolean(session.saving.effort))
const savingOperation = computed(() => Boolean(session.saving.operation))
const savingNote = computed(() => Boolean(session.saving.note))
const checkingDomainId = ref<number | null>(null)
const noteDialogVisible = ref(false); const historyVisible = ref(false); const editingNoteId = ref<number | null>(null)
const taskDialogVisible = ref(false)
const editingTask = ref<WebsiteTask>()
const taskEdit = reactive({ title: '', description: '', completion_summary: '', result_url: '', due_at: '', review_delay_days: 28, review_window_days: 28 })
const domainForm = reactive({ domain: '', registrar: '', registrar_date: '', expiry_date: '' })
const taskForm = reactive({ task_type: '内容' as WebsiteTaskType, title: '', description: '', review_delay_days: 28, review_window_days: 28 })
const baselineRange = ref<string[]>([])
const baselineClicks = ref<number>()
const incomeForm = reactive({ income_month: '', source: '', currency: 'USD', amount: 0 })
const effortForm = reactive({ week_start: '', hours: 0 })
const operationForm = reactive({ operation_date: '', operation_kind: 'SEO' })
const noteForm = reactive<{ kind: 'AI提示词' | '想法说明'; content: string }>({ kind: 'AI提示词', content: '' })
let profileOriginal: typeof profile | undefined
let profileWebsiteId: number | undefined
const profileDirty = computed(() => Boolean(props.visible && session.isDirty('profile')))
const workHistoryBusy=ref(false)
const monitorPanel = ref<InstanceType<typeof WebsiteMonitorPanel>>()
const deploymentPanel = ref<InstanceType<typeof WebsiteDeployment>>()
const taskEditDirty = computed(() => taskDialogVisible.value && session.isDirty('task-edit'))
const noteDirty = computed(() => noteDialogVisible.value && session.isDirty('note'))
for (const [key, read] of Object.entries({ profile: () => profile, domain: () => domainForm, task: () => ({ taskForm, baselineRange: baselineRange.value, baselineClicks: baselineClicks.value }), income: () => incomeForm, effort: () => effortForm, operation: () => operationForm })) session.draft(key, read)
session.observe(() => monitorPanel.value)
session.observe(() => deploymentPanel.value)
session.draft('task-edit', () => taskEdit)
session.draft('note', () => noteForm)
session.observe(() => ({ busy: workHistoryBusy.value }))
watch(taskDialogVisible, open => { if (!open) session.clean('task-edit') })
watch(noteDialogVisible, open => { if (!open) session.clean('note') })
const dirty = session.dirty
const savingAny = session.busy
useUnsavedChanges(dirty, { blocked: savingAny, leaving: (to, from) => to.path !== from.path || to.query.site !== from.query.site })
const beforeClose = async (done: () => void) => {
  if (savingAny.value) { ElMessage.warning('正在保存，请稍候'); return }
  if (!(await session.leave(confirmDiscard))) return
  done()
}
const closeTask = async (done: () => void) => { if (!savingTask.value && await confirmDiscard(taskEditDirty.value)) done() }
const closeNote = async (done: () => void) => { if (!savingNote.value && await confirmDiscard(noteDirty.value)) done() }
const markDraftsClean = (key?: string) => { if (key) session.clean(key); else for (const name of ['domain', 'task', 'income', 'effort', 'operation']) session.clean(name) }
const markProfileClean = () => { profileOriginal = JSON.parse(JSON.stringify(profile)); session.clean('profile') }
const notifyChanged = () => { invalidateData('/api/websites'); emit('changed') }
const loadAll = async () => {
  if (!props.website) return
  if (profileWebsiteId !== props.website.id) {
  Object.assign(profile, { name: props.website.name, stage: props.website.stage, new_site_mode: props.website.new_site_override === 1 ? 'new' : props.website.new_site_override === 0 ? 'regular' : 'auto', lifecycle: props.website.lifecycle, ownership: props.website.ownership, platform: props.website.platform, platform_other: props.website.platform_other || '', industry: props.website.industry || '', computer_name: props.website.computer_name || '', page_count: props.website.page_count ?? undefined, adsense_connected: props.website.adsense_connected, adsense_account_id: props.website.adsense_account_id || undefined, adsense_opened_date: props.website.adsense_opened_date || '', gsc_connected: props.website.gsc_connected, daily_clicks: props.website.daily_clicks ?? undefined, daily_clicks_range: props.website.daily_clicks_range || '', clicks_updated_date: props.website.clicks_updated_date || '', calculator_count: props.website.calculator_count ?? undefined, article_count: props.website.article_count ?? undefined, content_stats_updated_date: props.website.content_stats_updated_date || '', potential: props.website.potential || '', next_action: props.website.next_action || '', next_action_due_date: props.website.next_action_due_date || '', next_action_status: props.website.next_action_status || '待做' })
    profileWebsiteId = props.website.id
    markProfileClean()
    tasks.value = []; incomes.value = []; efforts.value = []; operations.value = []; notes.value = []
  }
  domains.value = queue.applyPendingDomains(props.website.domains || [])
  await loadSection(activeSection.value, true)
}
const loadSection = async (section: WebsiteSection, force = false) => {
  const id = props.website?.id
  if (!id || !props.visible) return
  const reads: Array<{read: () => Promise<unknown>; assign: (value: any) => void}> = []
  const read = <T,>(url: string, assign: (value: T) => void) => reads.push({ read: () => api.get<T>(url), assign })
  if (section === 'domains') read<WebsiteDomain[]>(`/api/domains?website_id=${id}`, value => { domains.value = queue.applyPendingDomains(value) })
  if (section === 'work') {
    read<WebsiteTask[]>(`/api/websites/${id}/tasks`, value => { tasks.value = value })
    read<OperationRow[]>(`/api/websites/${id}/operations`, value => { operations.value = value })
    read<AiNote[]>(`/api/websites/${id}/ai-notes`, value => { notes.value = value })
  }
  if (section === 'finance') {
    read<IncomeRow[]>(`/api/websites/${id}/income`, value => { incomes.value = value })
    read<EffortRow[]>(`/api/websites/${id}/effort`, value => { efforts.value = value })
    read<Array<{ id: number; name: string }>>('/api/adsense/accounts', value => { adsenseAccounts.value = value })
  }
  await session.load(section, reads, force)
}
watch(activeSection, section => { void loadSection(section) })

const saveProfile = async () => {
  if (!props.website || saving.value) return
  try {
    const original = profileOriginal
    if (!original) return
    const editFields = (draft: typeof profile) => {
      const { new_site_mode, ...fields } = draft
      return { ...fields, new_site_override: new_site_mode === 'new' ? 1 : new_site_mode === 'regular' ? 0 : null,
        daily_clicks: draft.daily_clicks_range ? null : draft.daily_clicks ?? null,
        daily_clicks_range: draft.daily_clicks_range || null,
        clicks_updated_date: draft.daily_clicks != null || draft.daily_clicks_range ? draft.clicks_updated_date || null : null }
    }
    const patch = websiteEditPatch(editFields(profile), editFields(original))
    if (!Object.keys(patch).length) return
    const id = props.website.id, submitted = JSON.parse(JSON.stringify(profile)) as typeof profile
    await session.save('profile', () => api.patch(`/api/websites/${id}`, patch), () => {
      if (Object.prototype.hasOwnProperty.call(patch, 'adsense_account_id')) invalidateData('/api/adsense/accounts')
      profileOriginal = submitted; notifyChanged(); ElMessage.success('经营信息已保存')
    })
  }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '经营信息保存失败') }
}
const clearExactClicks = (range: string) => { if (range) profile.daily_clicks = undefined }
const addDomain = async () => {
  if (!props.website) return
  const id = props.website.id
  try { await session.save('domain', () => api.post<WebsiteDomain>('/api/domains', { ...domainForm, website_id: id, service_type: '网站', status: '在线', domain_role: '备用域名' }), (created, unchanged) => { domains.value.push(created); if (unchanged) Object.assign(domainForm, { domain: '', registrar: '', registrar_date: '', expiry_date: '' }); notifyChanged(); ElMessage.success('域名已关联') }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '域名关联失败') }
}
const setPrimary = async (domain: WebsiteDomain) => {
  try { await session.save('primary-domain', () => api.put(`/api/domains/${domain.id}`, { domain_role: '主域名' }), async () => { await loadAll(); notifyChanged() }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '主域名更新失败') }
}
const removeDomain = async (id: number) => {
  try { await session.save('remove-domain', async () => { await confirmAction('删除这个域名？网站经营记录会保留。', '删除域名', { confirmButtonText: '删除域名' }); await api.delete(`/api/domains/${id}`) }, async () => { await loadAll(); notifyChanged() }) }
  catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '域名删除失败') }
}
const checkDomain = async (domain: WebsiteDomain) => {
  if (checkingDomainId.value != null) return
  checkingDomainId.value = domain.id
  try { await session.save('domain-check', async () => { const result = await api.post<{ status: '在线' | '离线' }>('/api/domains/check', { domain: domain.domain }); const checkedAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); queue.enqueue({ type: 'domain_patch', id: domain.id, fields: { status: result.status, last_status_check_at: checkedAt } }); Object.assign(domain, { status: result.status, last_status_check_at: checkedAt }); const synced = await queue.flush(); return synced }, synced => { notifyChanged(); ElMessage[synced.pending ? 'warning' : 'success'](synced.pending ? '检查完成，状态已保存在本机待同步' : `${domain.domain}：${domain.status}`) }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '域名检查失败') }
  finally { checkingDomainId.value = null }
}
const addTask = async () => {
  if (!props.website) return
  const id = props.website.id
  const baseline = baselineClicks.value == null ? undefined : { period_start: baselineRange.value[0], period_end: baselineRange.value[1], clicks: baselineClicks.value }
  try { await session.save('task', () => api.post<WebsiteTask>(`/api/websites/${id}/tasks`, { ...taskForm, baseline }), (task, unchanged) => {
    tasks.value.unshift(task); if (unchanged) { Object.assign(taskForm, { task_type: '内容', title: '', description: '', review_delay_days: 28, review_window_days: 28 }); baselineRange.value = []; baselineClicks.value = undefined }; notifyChanged()
  }) } catch (e) { ElMessage.error(e instanceof Error ? e.message : '任务添加失败') }
}
const updateTask = async (task: WebsiteTask, fields: Record<string, unknown>) => {
  const id = props.website?.id
  if (!id) return
  try { await session.save('task-status', () => api.put(`/api/websites/${id}/tasks/${task.id}`, fields), async () => { await loadAll(); notifyChanged() }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '任务更新失败') }
}
const editTask = (task: WebsiteTask) => {
  editingTask.value = task
  Object.assign(taskEdit, { title: task.title, description: task.description || '', completion_summary: task.completion_summary || '', result_url: task.result_url || '', due_at: task.due_at || '', review_delay_days: task.review_delay_days, review_window_days: task.review_window_days })
  taskDialogVisible.value = true
  session.clean('task-edit')
}
const saveTaskEdit = async () => {
  if (!props.website || !editingTask.value || savingTask.value) return
  try {
    const body: Record<string, unknown> = { title: taskEdit.title, description: taskEdit.description || null, completion_summary: taskEdit.completion_summary || null, result_url: taskEdit.result_url || null, due_at: taskEdit.due_at || null }
    if (editingTask.value.task_type === 'SEO' && !editingTask.value.completed_at) Object.assign(body, { review_delay_days: taskEdit.review_delay_days, review_window_days: taskEdit.review_window_days })
    const id = props.website.id, taskId = editingTask.value.id
    await session.save('task-edit', () => api.put(`/api/websites/${id}/tasks/${taskId}`, body), async (_value, unchanged) => { if (unchanged) taskDialogVisible.value = false; await loadAll(); notifyChanged() })
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '任务保存失败') }
}
const removeTask = async (task: WebsiteTask) => {
  const id = props.website?.id
  if (!id) return
  try { await session.save('remove-task', async () => { await confirmAction(`删除任务“${task.title}”？`, '删除任务', { confirmButtonText: '删除' }); await api.delete(`/api/websites/${id}/tasks/${task.id}`) }, async () => { await loadAll(); notifyChanged() }) }
  catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '任务删除失败') }
}
const addOperation = async () => {
  if (!props.website) return
  const id = props.website.id
  try { await session.save('operation', () => api.post<OperationRow>(`/api/websites/${id}/operations`, operationForm), row => { operations.value = [row, ...operations.value.filter(item => item.id !== row.id)]; notifyChanged() }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '操作记录保存失败') }
}
const removeOperation = async (item: OperationRow) => {
  const id = props.website?.id
  if (!id) return
  try { await session.save('remove-operation', async () => { await confirmAction(`删除 ${item.operation_date} 的 ${item.operation_kind} 操作记录？`, '删除操作记录', { confirmButtonText: '删除' }); await api.delete(`/api/websites/${id}/operations/${item.id}`) }, () => { operations.value = operations.value.filter(row => row.id !== item.id); notifyChanged() }) }
  catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '操作记录删除失败') }
}
const editNote = (item?: AiNote) => { editingNoteId.value = item?.id || null; noteForm.kind = item?.kind || 'AI提示词'; noteForm.content = item?.content || ''; noteDialogVisible.value = true; session.clean('note') }
const saveNote = async () => {
  if (!props.website) return
  const path = `/api/websites/${props.website.id}/ai-notes`, noteId = editingNoteId.value
  try { await session.save('note', async () => { await (noteId ? api.put(`${path}/${noteId}`, noteForm) : api.post(path, noteForm)); return api.get<AiNote[]>(path) }, (value, unchanged) => { if (unchanged) noteDialogVisible.value = false; notes.value = value; notifyChanged() }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '记录保存失败') }
}
const archiveNote = async (item: AiNote) => {
  const id = props.website?.id
  if (!id) return
  try { await session.save('archive-note', async () => { await confirmAction(`归档这条${item.kind}记录？`, '归档记录', { confirmButtonText: '归档' }); await api.post(`/api/websites/${id}/ai-notes/${item.id}`) }, () => { notes.value = notes.value.filter(note => note.id !== item.id); notifyChanged() }) }
  catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '记录归档失败') }
}
const showNoteHistory = async (item: AiNote) => {
  if (!props.website) return
  const id = props.website.id
  await session.load('note-history', [{ read: () => api.get<NoteVersion[]>(`/api/websites/${id}/ai-notes/${item.id}`), assign: value => { noteHistory.value = value; historyVisible.value = true } }], true)
  if (session.errors['note-history']) ElMessage.error(session.errors['note-history'])
}
const saveIncome = async () => {
  if (!props.website) return
  const path = `/api/websites/${props.website.id}/income`
  try { await session.save('income', async () => { await api.post(path, incomeForm); return api.get<IncomeRow[]>(path) }, value => { incomes.value = value; notifyChanged() }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '收入保存失败') }
}
const saveEffort = async () => {
  if (!props.website) return
  const path = `/api/websites/${props.website.id}/effort`
  try { await session.save('effort', async () => { await api.post(path, effortForm); return api.get<EffortRow[]>(path) }, value => { efforts.value = value; notifyChanged() }) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '投入时间保存失败') }
}
watch([() => props.visible, () => props.website?.id], ([open]) => {
  session.begin(open ? props.website?.id : undefined)
  profileWebsiteId = undefined
  noteDialogVisible.value = false; taskDialogVisible.value = false; historyVisible.value = false
  Object.assign(taskForm, { task_type: '内容', title: '', description: '', review_delay_days: 28, review_window_days: 28 })
  Object.assign(domainForm, { domain: '', registrar: '', registrar_date: '', expiry_date: '' })
  Object.assign(incomeForm, { income_month: '', source: '', currency: 'USD', amount: 0 })
  Object.assign(effortForm, { week_start: '', hours: 0 })
  baselineRange.value = []; baselineClicks.value = undefined
  Object.assign(operationForm, { operation_date: '', operation_kind: 'SEO' })
  markDraftsClean()
  if (open) void loadAll()
})
onMounted(updateDrawerSize)
onMounted(() => window.addEventListener('resize', updateDrawerSize))
onUnmounted(() => window.removeEventListener('resize', updateDrawerSize))
</script>

<style scoped src="../styles/dialogs/website-detail.css"></style>
