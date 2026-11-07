<template>
  <div class="home-container portfolio-page">
    <WorkspaceHeading title="网站组合" subtitle="按经营阶段查看网站、收入、投入与待处理工作">
      <el-button :icon="Refresh" :loading="loading" aria-label="刷新网站" title="刷新网站" @click="load(true)" />
      <el-button type="primary" :icon="Plus" @click="createVisible = true">新增网站</el-button>
    </WorkspaceHeading>

    <div v-if="error" class="page-error" role="alert"><span>{{ error }}</span><el-button @click="load(true)">重试</el-button></div>
    <div class="portfolio-toolbar">
      <el-input v-model="search" class="portfolio-search" :prefix-icon="Search" clearable placeholder="搜索网站、域名、下一步行动" aria-label="搜索网站" />
      <nav class="portfolio-stage-tabs" aria-label="经营阶段筛选">
        <button v-for="tab in portfolioTabs" :key="tab.value" type="button" class="portfolio-stage-tab" :class="{ 'is-active': activePortfolio === tab.value }" :data-filter="tab.value" :aria-pressed="activePortfolio === tab.value" @click="selectPortfolio(tab.value)"><span>{{ tab.label }}</span><small>{{ tab.count }}</small></button>
        <button v-if="sortKey" type="button" class="portfolio-sort-reset" aria-label="恢复默认排序" title="恢复默认排序" @click="resetSort">恢复默认排序</button>
      </nav>
    </div>

    <div v-if="selectedIds.size" class="portfolio-bulk-toolbar" role="region" aria-label="批量操作">
      <strong>已选 {{ selectedIds.size }} 个网站</strong>
      <el-select v-model="bulkStage" size="small" aria-label="批量设置阶段" placeholder="批量设置阶段">
        <el-option v-for="item in stages" :key="item" :value="item" :label="item" />
      </el-select>
      <el-button size="small" type="primary" :loading="bulkUpdating" @click="applyBulkUpdate({ stage: bulkStage })">设置阶段</el-button>
      <el-button size="small" :loading="bulkUpdating" @click="applyBulkUpdate({ lifecycle: view === 'stopped' ? 'active' : 'stopped' })">{{ view === 'stopped' ? '恢复经营' : '停止经营' }}</el-button>
      <el-button size="small" text :disabled="bulkUpdating" @click="clearSelection">清空选择</el-button>
    </div>

    <div v-if="loading && !websites.length" class="portfolio-empty">正在加载网站…</div>
    <template v-else-if="view === 'active'">
      <section v-for="stage in visibleStages" :key="stage" class="portfolio-stage" :aria-label="stage">
        <header class="portfolio-stage-heading"><h2>{{ stage }}</h2><span>{{ grouped[stage].length }}</span></header>
        <div v-if="grouped[stage].length" class="portfolio-list">
          <div class="portfolio-table-wrap">
            <table class="portfolio-table" :class="`portfolio-table-${scenarioFor(stage)}`">
              <thead><tr><th v-for="column in columnsFor(stage)" :key="column.key" :class="column.class" :style="{ width: `${column.width}px` }" :aria-sort="sortAria(column.key)"><div v-if="column.key === 'identity'" class="portfolio-header-with-selection"><el-checkbox :model-value="allVisibleSelected(grouped[stage])" :indeterminate="someVisibleSelected(grouped[stage])" :aria-label="`选择全部${stage}网站`" @change="value => toggleVisibleSelection(grouped[stage], Boolean(value))" /><button v-if="column.sortable !== false" type="button" class="portfolio-sort-trigger" :aria-label="sortActionLabel(column)" :title="sortActionLabel(column)" @click="toggleSort(column.key)"><span>{{ column.label }}</span><el-icon aria-hidden="true"><ArrowUp v-if="sortKey === column.key && sortDirection === 'asc'" /><ArrowDown v-else-if="sortKey === column.key" /><Sort v-else /></el-icon></button><span v-else>{{ column.label }}</span></div><button v-else-if="column.sortable !== false" type="button" class="portfolio-sort-trigger" :aria-label="sortActionLabel(column)" :title="sortActionLabel(column)" @click="toggleSort(column.key)"><span>{{ column.label }}</span><el-icon aria-hidden="true"><ArrowUp v-if="sortKey === column.key && sortDirection === 'asc'" /><ArrowDown v-else-if="sortKey === column.key" /><Sort v-else /></el-icon></button><span v-else>{{ column.label }}</span></th></tr></thead>
              <tbody>
                <tr v-for="site in grouped[stage]" :key="site.id" class="portfolio-row">
                  <td v-for="column in columnsFor(stage)" :key="column.key" :class="column.class">
                    <div v-if="column.key === 'identity'" class="portfolio-identity">
                      <el-checkbox :model-value="isSelected(site.id)" :aria-label="`选择网站：${site.name}`" @change="value => setSelected(site.id, Boolean(value))" />
                      <span class="portfolio-site-status" :class="primaryDomain(site)?.status === '在线' ? 'is-online' : primaryDomain(site)?.status === '离线' ? 'is-offline' : 'is-unknown'" :title="primaryDomain(site)?.status || '未检查'" aria-hidden="true"></span>
                      <button class="portfolio-site-name" :aria-label="`查看网站：${site.name}`" @click="openSite(site)">{{ site.name }}</button>
                      <a v-if="primaryDomain(site)" class="portfolio-primary-domain" :href="`https://${primaryDomain(site)!.domain}`" target="_blank" rel="noopener noreferrer">{{ primaryDomain(site)!.domain }}</a>
                      <small v-if="site.domains.length > 1" class="portfolio-domain-count">{{ site.domains.length }} 个域名</small>
                    </div>
                    <el-select v-else-if="column.key === 'platform'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.platform" :aria-label="`技术栈：${site.name}`" @change="value => savePlatform(site, value)"><el-option v-for="item in platforms" :key="item" :value="item" :label="item === '其他' && site.platform === '其他' ? platformLabel(site) : item" /></el-select>
                    <el-select v-else-if="column.key === 'ownership'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.ownership" :aria-label="`网站归属：${site.name}`" @change="value => saveSite(site, { ownership: value })"><el-option v-for="item in ownershipOptions" :key="item" :value="item" :label="item" /></el-select>
                    <el-select v-else-if="column.key === 'industry'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.industry || '其他'" :aria-label="`网站类型：${site.name}`" @change="value => saveSite(site, { industry: value })"><el-option v-for="item in industryOptions" :key="item" :value="item" :label="item" /></el-select>
                    <el-popover v-else-if="column.key === 'clicks'" :visible="clickEditorOpen[site.id] || false" trigger="click" placement="bottom-start" :width="260" @update:visible="value => clickEditorOpen[site.id] = value">
                      <div class="portfolio-click-editor">
                        <el-input-number v-model="clickDrafts[site.id].exact" :min="0" :precision="0" :controls="false" clearable placeholder="精确日点击" aria-label="精确日点击" @change="clickDrafts[site.id].range = ''" />
                        <el-select v-model="clickDrafts[site.id].range" clearable placeholder="或选择点击区间" aria-label="日点击区间" @change="value => value && (clickDrafts[site.id].exact = undefined)"><el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" /></el-select>
                        <el-date-picker v-model="clickDrafts[site.id].date" type="date" value-format="YYYY-MM-DD" clearable placeholder="统计日期" aria-label="点击统计日期" />
                        <div class="portfolio-click-editor-actions"><el-button size="small" @click="clickEditorOpen[site.id] = false">取消</el-button><el-button size="small" type="primary" :loading="savingSiteIds.has(site.id)" @click="saveClicks(site)">保存</el-button></div>
                      </div>
                      <template #reference><button type="button" class="portfolio-click-trigger" :disabled="savingSiteIds.has(site.id)" :aria-label="`编辑日点击：${site.name}`" title="编辑日点击" @click="prepareClicks(site)"><span class="portfolio-number-cell"><strong>{{ clickLabel(site) || '未填写' }}</strong><small>{{ site.clicks_updated_date || '日期未记录' }}</small></span><el-icon aria-hidden="true"><EditPen /></el-icon></button></template>
                    </el-popover>
                    <el-select v-else-if="column.key === 'adsense'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.adsense_connected" :aria-label="`AdSense 状态：${site.name}`" @change="value => saveSite(site, { adsense_connected: value })"><el-option v-for="item in serviceStates" :key="item" :value="item" :label="item" /></el-select>
                    <el-select v-else-if="column.key === 'gsc'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.gsc_connected" :aria-label="`GSC 状态：${site.name}`" @change="value => saveSite(site, { gsc_connected: value })"><el-option v-for="item in serviceStates" :key="item" :value="item" :label="item" /></el-select>
                    <div v-else-if="column.key === 'income'" class="portfolio-money-cell"><span v-for="income in site.income_totals || []" :key="income.currency">{{ income.currency }} {{ Number(income.amount).toFixed(2) }}</span><small v-if="!(site.income_totals || []).length">未记录</small></div>
                    <div v-else-if="column.key === 'effort'" class="portfolio-number-cell"><strong>{{ site.latest_effort ? `${Number(site.latest_effort.hours).toFixed(1)} 小时` : '未记录' }}</strong><small v-if="site.latest_effort">{{ site.latest_effort.week_start }} 起</small></div>
                    <el-select v-else-if="column.key === 'resources'" size="small" multiple collapse-tags clearable :max-collapse-tags="1" filterable :loading="resourceOptionsLoading" :disabled="savingSiteIds.has(site.id)" :model-value="site.resource_ids || []" :aria-label="`服务商 / 资源：${site.name}`" placeholder="未关联" @visible-change="visible => visible && loadResourceOptions()" @change="value => saveResources(site, value)"><el-option v-for="resource in resourceOptions" :key="resource.id" :value="resource.id!" :label="resourceOptionLabel(resource)" :disabled="resource.status === '停用'" /></el-select>
                    <div v-else-if="column.key === 'expiry'" class="portfolio-expiry-cell"><strong>{{ primaryDomain(site)?.expiry_date || '未填写' }}</strong><small v-if="primaryDomain(site)">{{ primaryDomain(site)!.status }}</small></div>
                    <el-select v-else-if="column.key === 'computer'" size="small" filterable allow-create clearable default-first-option :disabled="savingSiteIds.has(site.id) || !primaryDomain(site)" :model-value="primaryDomain(site)?.computer_name || ''" :aria-label="`电脑：${site.name}`" placeholder="未选择" @change="value => saveComputer(site, value)"><el-option v-for="name in computerNames" :key="name" :value="name" :label="name" /></el-select>
                    <el-popover v-else-if="column.key === 'next_action'" :visible="nextActionOpen[site.id] || false" trigger="click" placement="bottom-start" :width="340" @update:visible="value => nextActionOpen[site.id] = value">
                      <div class="portfolio-next-editor">
                        <el-input v-model="nextActionDrafts[site.id].text" maxlength="300" :disabled="savingSiteIds.has(site.id)" aria-label="下一步行动" placeholder="填写经营下一步" />
                        <el-select v-model="nextActionDrafts[site.id].status" :disabled="savingSiteIds.has(site.id)" aria-label="下一步状态"><el-option v-for="status in nextActionStatuses" :key="status" :value="status" :label="status" /></el-select>
                        <el-date-picker v-model="nextActionDrafts[site.id].dueDate" type="date" value-format="YYYY-MM-DD" clearable :disabled="savingSiteIds.has(site.id)" aria-label="下一步截止日" placeholder="截止日期" />
                        <div class="portfolio-next-editor-actions"><el-button size="small" :disabled="savingSiteIds.has(site.id)" @click="nextActionOpen[site.id] = false">取消</el-button><el-button size="small" type="primary" :loading="savingSiteIds.has(site.id)" @click="saveNextAction(site)">保存下一步</el-button></div>
                      </div>
                      <template #reference><button type="button" class="portfolio-next-trigger" :disabled="savingSiteIds.has(site.id)" :aria-label="`编辑下一步：${site.name}`" title="编辑下一步" @click="prepareNextAction(site)"><span class="portfolio-next-cell"><strong>{{ site.next_action || '未设置' }}</strong><small>{{ site.next_action_status }}<template v-if="site.next_action_due_date"> · {{ site.next_action_due_date }}</template></small><small v-if="site.open_task_count || site.review_count">待办 {{ site.open_task_count || 0 }} · 复查 {{ site.review_count || 0 }}</small></span><el-icon aria-hidden="true"><EditPen /></el-icon></button></template>
                    </el-popover>
                    <div v-else-if="column.key === 'tasks'" class="portfolio-number-cell"><strong>待办 {{ site.open_task_count || 0 }}</strong><small>复查 {{ site.review_count || 0 }}</small></div>
                    <div v-else-if="column.key === 'potential'" class="portfolio-potential-cell">{{ site.potential || '未记录' }}</div>
                    <div v-else-if="column.key === 'domain_status'" class="portfolio-domain-status-cell"><strong>{{ primaryDomain(site)?.status || '未检查' }}</strong><small>{{ primaryDomain(site)?.last_status_check_at || '无检测时间' }}</small></div>
                    <div v-else-if="column.key === 'stage'" class="portfolio-stage-cell"><el-select size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.stage" :aria-label="`网站阶段：${site.name}`" @change="value => saveSite(site, { stage: value })"><el-option v-for="item in stages" :key="item" :value="item" :label="item" /></el-select></div>
                    <div v-else-if="column.key === 'actions'" class="portfolio-actions-cell"><el-select v-if="scenarioFor(stage) !== 'all'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.stage" :aria-label="`网站阶段：${site.name}`" @change="value => saveSite(site, { stage: value })"><el-option v-for="item in stages" :key="item" :value="item" :label="item" /></el-select><el-button text :icon="View" :disabled="savingSiteIds.has(site.id)" title="查看详情" :aria-label="`查看详情：${site.name}`" @click="openSite(site)" /></div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-else class="portfolio-empty">此阶段暂无网站。</p>
      </section>
      <section v-if="!websites.length" class="portfolio-empty">还没有网站，先新增一个网站和域名。</section>
      <section v-else-if="!websites.some(site => site.lifecycle === 'active')" class="portfolio-empty">当前没有经营中的网站，可在“停止经营”中恢复网站。</section>
    </template>
    <section v-else class="portfolio-stage" aria-label="停止经营网站">
      <header class="portfolio-stage-heading"><h2>停止经营</h2><span>{{ stoppedSites.length }}</span></header>
      <div v-if="stoppedSites.length" class="portfolio-list">
        <div class="portfolio-table-wrap">
          <table class="portfolio-table portfolio-stopped-table"><thead><tr><th v-for="column in stoppedColumns" :key="column.key" :class="column.class" :style="{ width: `${column.width}px` }" :aria-sort="sortAria(column.key)"><div v-if="column.key === 'identity'" class="portfolio-header-with-selection"><el-checkbox :model-value="allVisibleSelected(stoppedSites)" :indeterminate="someVisibleSelected(stoppedSites)" aria-label="选择全部停止经营网站" @change="value => toggleVisibleSelection(stoppedSites, Boolean(value))" /><button v-if="column.sortable !== false" type="button" class="portfolio-sort-trigger" :aria-label="sortActionLabel(column)" :title="sortActionLabel(column)" @click="toggleSort(column.key)"><span>{{ column.label }}</span><el-icon aria-hidden="true"><ArrowUp v-if="sortKey === column.key && sortDirection === 'asc'" /><ArrowDown v-else-if="sortKey === column.key" /><Sort v-else /></el-icon></button><span v-else>{{ column.label }}</span></div><button v-else-if="column.sortable !== false" type="button" class="portfolio-sort-trigger" :aria-label="sortActionLabel(column)" :title="sortActionLabel(column)" @click="toggleSort(column.key)"><span>{{ column.label }}</span><el-icon aria-hidden="true"><ArrowUp v-if="sortKey === column.key && sortDirection === 'asc'" /><ArrowDown v-else-if="sortKey === column.key" /><Sort v-else /></el-icon></button><span v-else>{{ column.label }}</span></th></tr></thead><tbody><tr v-for="site in stoppedSites" :key="site.id" class="portfolio-row"><td v-for="column in stoppedColumns" :key="column.key" :class="column.class">
            <div v-if="column.key === 'identity'" class="portfolio-identity"><el-checkbox :model-value="isSelected(site.id)" :aria-label="`选择网站：${site.name}`" @change="value => setSelected(site.id, Boolean(value))" /><span class="portfolio-site-status is-unknown" aria-hidden="true"></span><button class="portfolio-site-name" :aria-label="`查看网站：${site.name}`" @click="openSite(site)">{{ site.name }}</button><a v-if="primaryDomain(site)" class="portfolio-primary-domain" :href="`https://${primaryDomain(site)!.domain}`" target="_blank" rel="noopener noreferrer">{{ primaryDomain(site)!.domain }}</a></div>
            <el-select v-else-if="column.key === 'stage'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.stage" :aria-label="`网站阶段：${site.name}`" @change="value => saveSite(site, { stage: value })"><el-option v-for="item in stages" :key="item" :value="item" :label="item" /></el-select>
            <el-select v-else-if="column.key === 'platform'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.platform" :aria-label="`技术栈：${site.name}`" @change="value => savePlatform(site, value)"><el-option v-for="item in platforms" :key="item" :value="item" :label="item === '其他' && site.platform === '其他' ? platformLabel(site) : item" /></el-select>
            <el-select v-else-if="column.key === 'ownership'" size="small" :disabled="savingSiteIds.has(site.id)" :model-value="site.ownership" :aria-label="`网站归属：${site.name}`" @change="value => saveSite(site, { ownership: value })"><el-option v-for="item in ownershipOptions" :key="item" :value="item" :label="item" /></el-select>
            <span v-else-if="column.key === 'expiry'">{{ primaryDomain(site)?.expiry_date || '未填写' }}</span>
            <el-select v-else-if="column.key === 'computer'" size="small" filterable allow-create clearable default-first-option :disabled="savingSiteIds.has(site.id) || !primaryDomain(site)" :model-value="primaryDomain(site)?.computer_name || ''" :aria-label="`电脑：${site.name}`" placeholder="未选择" @change="value => saveComputer(site, value)"><el-option v-for="name in computerNames" :key="name" :value="name" :label="name" /></el-select>
            <div v-else-if="column.key === 'actions'" class="portfolio-actions-cell"><el-button text :icon="View" :disabled="savingSiteIds.has(site.id)" title="查看详情" :aria-label="`查看详情：${site.name}`" @click="openSite(site)" /><el-button size="small" type="primary" :disabled="savingSiteIds.has(site.id)" @click="saveSite(site, { lifecycle: 'active' })">恢复经营</el-button><el-button size="small" text type="danger" @click="removeSite(site)">删除网站</el-button></div>
          </td></tr></tbody></table>
        </div>
      </div>
      <p v-else class="portfolio-empty">没有停止经营的网站。</p>
    </section>

    <el-dialog v-model="createVisible" title="新增网站" width="min(560px, 94vw)" destroy-on-close>
      <el-form label-position="top" @submit.prevent="createSite">
        <el-form-item label="网站名称" required><el-input v-model="newSite.name" maxlength="200" /></el-form-item>
        <el-form-item label="主域名" required><el-input v-model="newSite.domain" placeholder="example.com" /></el-form-item>
        <div class="portfolio-domain-form-grid">
          <el-form-item label="注册商" required><el-input v-model="newSite.registrar" /></el-form-item>
          <el-form-item label="服务类型" required><el-input v-model="newSite.service_type" /></el-form-item>
          <el-form-item label="注册日期" required><el-date-picker v-model="newSite.registrar_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
          <el-form-item label="到期日期" required><el-date-picker v-model="newSite.expiry_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        </div>
      </el-form>
      <template #footer><div class="dialog-footer"><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="createSite">创建网站</el-button></div></template>
    </el-dialog>

    <WebsiteDetailDrawer v-model:visible="detailVisible" :website="selected" @changed="load(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { EditPen, Plus, Refresh, Search, Sort, View } from '@element-plus/icons-vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteDetailDrawer from '../components/WebsiteDetailDrawer.vue'
import { confirmAction, isDismissed } from '../utils/feedback'
import { bulkUpdateWebsites, createWebsite, deleteWebsite, getWebsites, updateWebsite, type Website, type WebsiteStage } from '../api/websites'
import type { ProviderResource, ProviderType } from '../../functions/types'
import { api } from '../utils/request'
import { invalidateData, localDate } from '../utils/workspaceCache'
import { isWebsiteNew } from '../../shared/website-newness'
import '../styles/home/home.css'

const stages: WebsiteStage[] = ['待评估', '验证', '增长', '维护', '暂停']
const ownershipOptions = ['未分类', '自营网站', '企业客户网站'] as const
const industryOptions = ['计算器', '资讯站', '其他'] as const
const platforms = ['WordPress', 'Astro', 'Next.js', '其他'] as const
const serviceStates = ['未知', '已开通', '未开通'] as const
const nextActionStatuses: Website['next_action_status'][] = ['待做', '处理中', '已完成']
const providerLabels: Record<ProviderType, string> = { github: 'GitHub', cloudflare: 'Cloudflare', vhost: '虚拟主机', vps: 'VPS' }
type PortfolioColumnKey = 'identity' | 'platform' | 'ownership' | 'industry' | 'clicks' | 'adsense' | 'gsc' | 'income' | 'effort' | 'resources' | 'expiry' | 'computer' | 'next_action' | 'tasks' | 'potential' | 'domain_status' | 'stage' | 'actions'
type PortfolioColumn = { key: PortfolioColumnKey; label: string; width: number; class?: string; sortable?: boolean }
type ResourceLinkRow = { id: number; website_id: number; resource_id: number; role: string }
type NextActionDraft = { text: string; status: Website['next_action_status']; dueDate: string }
type ClickDraft = { exact?: number; range: string; date: string }
const route = useRoute(); const router = useRouter()
const websites = ref<Website[]>([])
const resourceOptions = ref<ProviderResource[]>([])
const resourceOptionsLoaded = ref(false)
const resourceOptionsLoading = ref(false)
const loading = ref(false)
const saving = ref(false)
const savingSiteIds = reactive(new Set<number>())
const selectedIds = reactive(new Set<number>())
const bulkStage = ref<WebsiteStage>('待评估')
const bulkUpdating = ref(false)
const error = ref('')
const search = ref('')
const sortKey = ref<PortfolioColumnKey | ''>('')
const sortDirection = ref<'asc' | 'desc'>('asc')
const nextActionOpen = reactive<Record<number, boolean>>({})
const nextActionDrafts = reactive<Record<number, NextActionDraft>>({})
const nextActionOriginals = reactive<Record<number, NextActionDraft>>({})
const clickEditorOpen = reactive<Record<number, boolean>>({})
const clickDrafts = reactive<Record<number, ClickDraft>>({})
const view = computed<'active' | 'stopped'>(() => route.query.view === 'stopped' ? 'stopped' : 'active')
const activePortfolio = computed(() => view.value === 'stopped' ? 'stopped' : route.query.new === '1' ? 'new' : typeof route.query.stage === 'string' ? route.query.stage : 'all')
const createVisible = ref(false)
const detailVisible = computed({ get: () => Boolean(route.query.site && selected.value), set: value => { if (!value && route.query.site) { const query = { ...route.query }; delete query.site; void router.replace({ query }) } } })
const selected = ref<Website>()
const newSite = reactive({ name: '', domain: '', registrar: '', service_type: '网站', registrar_date: '', expiry_date: '' })
const computerNames = computed(() => [...new Set(websites.value.flatMap(site => site.domains.map(domain => domain.computer_name).filter((name): name is string => Boolean(name))))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' })))
const matchesSearch = (site: Website) => {
  if (route.query.adsense_account && String(site.adsense_account_id) !== String(route.query.adsense_account)) return false
  if (route.query.resource && !(site.resource_ids || []).includes(Number(route.query.resource))) return false
  if (route.query.provider_account && !(site.provider_account_ids || []).includes(Number(route.query.provider_account))) return false
  if (route.query.ownership && site.ownership !== route.query.ownership) return false
  if (route.query.platform && site.platform !== route.query.platform) return false
  const query = search.value.trim().toLowerCase()
  return !query || `${site.name} ${site.next_action || ''} ${site.domains.map(domain => domain.domain).join(' ')}`.toLowerCase().includes(query)
}
const isSelected = (siteId: number) => selectedIds.has(siteId)
const setSelected = (siteId: number, selected: boolean) => {
  if (selected) selectedIds.add(siteId)
  else selectedIds.delete(siteId)
}
const allVisibleSelected = (sites: Website[]) => sites.length > 0 && sites.every(site => selectedIds.has(site.id))
const someVisibleSelected = (sites: Website[]) => sites.some(site => selectedIds.has(site.id)) && !allVisibleSelected(sites)
const toggleVisibleSelection = (sites: Website[], selected: boolean) => {
  for (const site of sites) setSelected(site.id, selected)
}
const clickLabel = (site: Website) => {
  if (site.daily_clicks != null) return String(site.daily_clicks)
  return ({ under10: '10 次以下', '10to29': '10–29', '30to49': '30–49', '50to99': '50–99', over100: '100 次以上' } as Record<string, string>)[site.daily_clicks_range || ''] || ''
}
const primaryDomain = (site: Website) => site.domains.find(domain => domain.is_primary) || site.domains[0]
const platformLabel = (site: Website) => site.platform === '其他' ? site.platform_other || '其他' : site.platform
const isNewSite = (site: Website) => site.is_new_site ?? isWebsiteNew(site.new_site_override, primaryDomain(site)?.registrar_date, localDate())
const scenarioFor = (stage: WebsiteStage) => route.query.stage === stage ? stage : 'all'
const portfolioColumns: Record<string, PortfolioColumn[]> = {
  all: [
    { key: 'identity', label: '网站 / 主域名', width: 205, class: 'portfolio-site-column' },
    { key: 'platform', label: '技术栈', width: 88 },
    { key: 'ownership', label: '网站归属', width: 112 },
    { key: 'industry', label: '类型', width: 86 },
    { key: 'clicks', label: '日点击', width: 100 },
    { key: 'adsense', label: 'AdSense', width: 88 },
    { key: 'income', label: '本月收入', width: 118 },
    { key: 'resources', label: '服务商 / 资源', width: 138 },
    { key: 'expiry', label: '到期日期', width: 108 },
    { key: 'computer', label: '电脑', width: 112 },
    { key: 'next_action', label: '下一步', width: 158 },
    { key: 'stage', label: '阶段', width: 88 },
    { key: 'actions', label: '操作', width: 70, sortable: false }
  ],
  '待评估': [
    { key: 'identity', label: '网站 / 主域名', width: 205, class: 'portfolio-site-column' },
    { key: 'platform', label: '技术栈', width: 94 }, { key: 'ownership', label: '网站归属', width: 108 },
    { key: 'industry', label: '网站类型', width: 94 }, { key: 'adsense', label: 'AdSense', width: 88 },
    { key: 'gsc', label: 'GSC', width: 82 }, { key: 'potential', label: '潜力说明', width: 170 },
    { key: 'expiry', label: '域名到期', width: 108 }, { key: 'next_action', label: '经营下一步', width: 170 },
    { key: 'actions', label: '阶段 / 操作', width: 120, sortable: false }
  ],
  '验证': [
    { key: 'identity', label: '网站 / 主域名', width: 205, class: 'portfolio-site-column' },
    { key: 'industry', label: '网站类型', width: 94 }, { key: 'clicks', label: '日点击 / 更新时间', width: 118 },
    { key: 'gsc', label: 'GSC', width: 82 }, { key: 'adsense', label: 'AdSense', width: 88 },
    { key: 'income', label: '本月收入', width: 120 }, { key: 'tasks', label: '任务 / 复查', width: 105 },
    { key: 'next_action', label: '验证下一步', width: 175 }, { key: 'expiry', label: '域名到期', width: 108 },
    { key: 'actions', label: '阶段 / 操作', width: 120, sortable: false }
  ],
  '增长': [
    { key: 'identity', label: '网站 / 主域名', width: 205, class: 'portfolio-site-column' },
    { key: 'clicks', label: '日点击 / 更新时间', width: 118 }, { key: 'income', label: '本月收入', width: 125 },
    { key: 'effort', label: '最近每周投入', width: 108 }, { key: 'adsense', label: 'AdSense', width: 88 },
    { key: 'tasks', label: '任务 / 复查', width: 105 }, { key: 'resources', label: '服务商 / 资源', width: 145 },
    { key: 'next_action', label: '增长下一步', width: 175 }, { key: 'actions', label: '阶段 / 操作', width: 120, sortable: false }
  ],
  '维护': [
    { key: 'identity', label: '网站 / 主域名', width: 205, class: 'portfolio-site-column' },
    { key: 'next_action', label: '维护事项 / 截止', width: 175 }, { key: 'tasks', label: '待办 / 到期复查', width: 110 },
    { key: 'domain_status', label: '域名状态 / 检测时间', width: 135 }, { key: 'expiry', label: '域名到期', width: 108 },
    { key: 'computer', label: '电脑', width: 110 }, { key: 'clicks', label: '点击 / 更新时间', width: 118 },
    { key: 'resources', label: '服务商 / 资源', width: 145 }, { key: 'actions', label: '阶段 / 操作', width: 120, sortable: false }
  ],
  '暂停': [
    { key: 'identity', label: '网站 / 主域名', width: 205, class: 'portfolio-site-column' },
    { key: 'ownership', label: '网站归属', width: 108 }, { key: 'expiry', label: '域名到期', width: 108 },
    { key: 'domain_status', label: '域名状态 / 检测时间', width: 135 }, { key: 'resources', label: '服务商 / 资源', width: 145 },
    { key: 'potential', label: '潜力 / 暂停原因', width: 175 }, { key: 'actions', label: '阶段 / 操作', width: 120, sortable: false }
  ]
}
const stoppedColumns: PortfolioColumn[] = [
  { key: 'identity', label: '网站 / 主域名', width: 220, class: 'portfolio-site-column' },
  { key: 'stage', label: '阶段', width: 100 }, { key: 'platform', label: '技术栈', width: 105 },
  { key: 'ownership', label: '归属', width: 115 }, { key: 'expiry', label: '到期日期', width: 112 },
  { key: 'computer', label: '电脑', width: 120 }, { key: 'actions', label: '操作', width: 220, sortable: false }
]
const columnsFor = (stage: WebsiteStage) => portfolioColumns[scenarioFor(stage)] || portfolioColumns.all
const sortValue = (site: Website, key: PortfolioColumnKey): string | number => {
  const domain = primaryDomain(site)
  switch (key) {
    case 'identity': return site.name
    case 'platform': return platformLabel(site)
    case 'ownership': return site.ownership
    case 'industry': return site.industry || ''
    case 'clicks': return site.daily_clicks ?? ({ under10: 0, '10to29': 10, '30to49': 30, '50to99': 50, over100: 100 } as Record<string, number>)[site.daily_clicks_range || ''] ?? -1
    case 'adsense': return site.adsense_connected
    case 'gsc': return site.gsc_connected
    case 'effort': return site.latest_effort?.hours ?? -1
    case 'resources': return site.resource_names || ''
    case 'expiry': return domain?.expiry_date || ''
    case 'computer': return domain?.computer_name || ''
    case 'next_action': return `${site.next_action || ''}\u0000${site.next_action_due_date || ''}\u0000${site.next_action_status}`
    case 'tasks': return Number(site.open_task_count || 0)
    case 'potential': return site.potential || ''
    case 'domain_status': return `${domain?.status || ''}\u0000${domain?.last_status_check_at || ''}`
    case 'income': return ''
    case 'stage': return stages.indexOf(site.stage)
    case 'actions': return ''
  }
}
const incomeEntries = (site: Website) => [...(site.income_totals || [])].sort((a, b) =>
  a.currency.localeCompare(b.currency) || Number(a.amount) - Number(b.amount)
)
const compareIncome = (left: Website, right: Website) => {
  const entries = (site: Website) => incomeEntries(site)
  const leftEntries = entries(left); const rightEntries = entries(right)
  for (let index = 0; index < Math.min(leftEntries.length, rightEntries.length); index++) {
    const a = leftEntries[index]; const b = rightEntries[index]
    const textComparison = a.currency.localeCompare(b.currency)
    if (textComparison) return textComparison
    const amountComparison = Number(a.amount) - Number(b.amount)
    if (amountComparison) return amountComparison
  }
  return leftEntries.length - rightEntries.length
}
const compareSites = (left: Website, right: Website, key: PortfolioColumnKey) => {
  if (key === 'income') return compareIncome(left, right) * (sortDirection.value === 'asc' ? 1 : -1)
  if (key === 'tasks') {
    const openTasks = Number(left.open_task_count || 0) - Number(right.open_task_count || 0)
    const reviews = Number(left.review_count || 0) - Number(right.review_count || 0)
    return (openTasks || reviews) * (sortDirection.value === 'asc' ? 1 : -1)
  }
  const a = sortValue(left, key); const b = sortValue(right, key)
  const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' })
  return comparison * (sortDirection.value === 'asc' ? 1 : -1)
}
const sortAria = (key: PortfolioColumnKey) => sortKey.value !== key ? 'none' : sortDirection.value === 'asc' ? 'ascending' : 'descending'
const sortActionLabel = (column: PortfolioColumn) => sortKey.value === column.key && sortDirection.value === 'desc' ? `恢复默认排序：${column.label}` : `按${column.label}${sortKey.value === column.key ? '降序' : '升序'}排序`
const toggleSort = (key: PortfolioColumnKey) => {
  if (sortKey.value === key && sortDirection.value === 'desc') { sortKey.value = ''; sortDirection.value = 'asc' }
  else if (sortKey.value === key) sortDirection.value = 'desc'
  else { sortKey.value = key; sortDirection.value = 'asc' }
}
const resetSort = () => { sortKey.value = ''; sortDirection.value = 'asc' }
const stoppedSites = computed(() => {
  const sites = websites.value.filter(site => site.lifecycle === 'stopped' && matchesSearch(site))
  return sortKey.value ? sites.sort((a, b) => compareSites(a, b, sortKey.value as PortfolioColumnKey) || a.id - b.id) : sites
})
const visibleStages = computed(() => {
  const visible = stages.filter(stage => !route.query.stage || route.query.stage === stage)
  return sortKey.value === 'stage' ? visible.sort((a, b) => (stages.indexOf(a) - stages.indexOf(b)) * (sortDirection.value === 'asc' ? 1 : -1)) : visible
})
const grouped = computed(() => Object.fromEntries(stages.map(stage => [stage, websites.value.filter(site => site.lifecycle === 'active' && site.stage === stage && (route.query.new !== '1' || isNewSite(site)) && matchesSearch(site)).sort((a, b) => {
  const sorted = sortKey.value ? compareSites(a, b, sortKey.value) : 0
  return sorted || a.priority_order - b.priority_order || a.id - b.id
})])) as Record<WebsiteStage, Website[]>)
const activeSites = computed(() => websites.value.filter(site => site.lifecycle === 'active' && matchesSearch(site)))
const newSites = computed(() => activeSites.value.filter(isNewSite))
const portfolioTabs = computed(() => [
  { label: '全部网站', value: 'all', count: activeSites.value.length },
  { label: '新站', value: 'new', count: newSites.value.length },
  ...stages.map(stage => ({ label: stage, value: stage, count: activeSites.value.filter(site => site.stage === stage).length })),
  { label: '停止经营', value: 'stopped', count: stoppedSites.value.length }
])
const selectPortfolio = (value: string) => {
  sortKey.value = ''
  sortDirection.value = 'asc'
  const query = { ...route.query }
  delete query.site; delete query.stage; delete query.view; delete query.new
  if (value === 'stopped') query.view = 'stopped'
  else if (value === 'new') query.new = '1'
  else if (value !== 'all') query.stage = value
  void router.push({ query })
}
const load = async (force = false) => {
  loading.value = true; error.value = ''
  try {
    websites.value = await getWebsites(force)
    const knownIds = new Set(websites.value.map(site => site.id))
    for (const id of [...selectedIds]) if (!knownIds.has(id)) selectedIds.delete(id)
    for (const site of websites.value) if (!nextActionDrafts[site.id]) {
      nextActionDrafts[site.id] = { text: site.next_action || '', status: site.next_action_status, dueDate: site.next_action_due_date || '' }
      nextActionOriginals[site.id] = { ...nextActionDrafts[site.id] }
    }
    for (const site of websites.value) if (!clickDrafts[site.id]) clickDrafts[site.id] = { exact: site.daily_clicks ?? undefined, range: site.daily_clicks_range || '', date: site.clicks_updated_date || '' }
  }
  catch (e) { error.value = e instanceof Error ? e.message : '网站加载失败' }
  finally { loading.value = false }
}
const clearSelection = () => selectedIds.clear()
const applyBulkUpdate = async (fields: Record<string, unknown>) => {
  const websiteIds = [...selectedIds]
  if (!websiteIds.length || bulkUpdating.value) return
  bulkUpdating.value = true
  try {
    const result = await bulkUpdateWebsites(websiteIds, fields)
    clearSelection()
    await load(true)
    ElMessage.success(`已更新 ${result.accepted} 个网站`)
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '网站批量更新失败') }
  finally { bulkUpdating.value = false }
}
const saveSite = async (site: Website, fields: Record<string, unknown>) => {
  if (savingSiteIds.has(site.id)) return false
  savingSiteIds.add(site.id)
  try { const updated = await updateWebsite(site.id, fields); Object.assign(site, updated); await load(true); return true }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '网站更新失败'); return false }
  finally { savingSiteIds.delete(site.id) }
}
const savePlatform = (site: Website, value: string) => saveSite(site, { platform: value, platform_other: value === '其他' ? site.platform_other || null : null })
const loadResourceOptions = async () => {
  if (resourceOptionsLoaded.value || resourceOptionsLoading.value) return
  resourceOptionsLoading.value = true
  try { resourceOptions.value = await api.get<ProviderResource[]>('/api/resources'); resourceOptionsLoaded.value = true }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '资源选项加载失败') }
  finally { resourceOptionsLoading.value = false }
}
const resourceOptionLabel = (resource: ProviderResource) => `${providerLabels[resource.provider]} · ${resource.name}`
const resourceRole = (provider: ProviderType) => ({ github: '代码仓库', cloudflare: '部署平台', vhost: '虚拟主机', vps: 'VPS' })[provider]
const saveResources = async (site: Website, value: number[]) => {
  if (savingSiteIds.has(site.id)) return
  savingSiteIds.add(site.id)
  try {
    await loadResourceOptions()
    const selectedIds = new Set(value.map(Number))
    const links = await api.get<ResourceLinkRow[]>(`/api/resources/links?website_id=${site.id}`)
    const existingIds = new Set(links.map(link => link.resource_id))
    const removals = links.filter(link => !selectedIds.has(link.resource_id))
    const additions = [...selectedIds].filter(id => !existingIds.has(id))
    if (!removals.length && !additions.length) return
    for (const id of additions) {
      const resource = resourceOptions.value.find(item => item.id === id)
      if (!resource) throw new Error('所选资源不存在或已停用')
      await api.post('/api/resources/links', { website_id: site.id, resource_id: id, role: resourceRole(resource.provider), is_primary: false })
    }
    for (const link of removals) await api.delete(`/api/resources/links?id=${link.id}`)
    invalidateData('/api/websites', '/api/resources/links')
    await load(true)
  } catch (e) {
    invalidateData('/api/websites', '/api/resources/links')
    await load(true)
    ElMessage.error(e instanceof Error ? e.message : '网站资源关联更新失败')
  } finally { savingSiteIds.delete(site.id) }
}
const saveComputer = async (site: Website, value: string | null) => {
  const domain = primaryDomain(site)
  if (!domain || (value || '') === (domain.computer_name || '') || savingSiteIds.has(site.id)) return
  savingSiteIds.add(site.id)
  try {
    await api.patch(`/api/domains/${domain.id}`, { computer_name: value || null })
    invalidateData('/api/websites', '/api/domains')
    await load(true)
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '电脑关联更新失败') }
  finally { savingSiteIds.delete(site.id) }
}
const prepareNextAction = (site: Website) => {
  nextActionDrafts[site.id] = { text: site.next_action || '', status: site.next_action_status, dueDate: site.next_action_due_date || '' }
  nextActionOriginals[site.id] = { ...nextActionDrafts[site.id] }
}
const saveNextAction = async (site: Website) => {
  const draft = nextActionDrafts[site.id]
  const original = nextActionOriginals[site.id]
  if (!draft || !original) return
  const patch: Record<string, unknown> = {}
  const text = draft.text.trim() || null
  if (text !== (original.text || null)) patch.next_action = text
  if (draft.status !== original.status) patch.next_action_status = draft.status
  if ((draft.dueDate || '') !== (original.dueDate || '')) patch.next_action_due_date = draft.dueDate || null
  if (!Object.keys(patch).length) { nextActionOpen[site.id] = false; return }
  const saved = await saveSite(site, patch)
  if (saved) {
    const updated = { text: site.next_action || '', status: site.next_action_status, dueDate: site.next_action_due_date || '' }
    nextActionDrafts[site.id] = updated
    nextActionOriginals[site.id] = { ...updated }
    nextActionOpen[site.id] = false
  }
}
const openSite = (site: Website) => { selected.value = site; void router.push({ query: { ...route.query, site: String(site.id) } }) }
const syncSelectedSite = () => { const id = Number(route.query.site); selected.value = websites.value.find(site => site.id === id) }
const prepareClicks = (site: Website) => {
  clickDrafts[site.id] = { exact: site.daily_clicks ?? undefined, range: site.daily_clicks_range || '', date: site.clicks_updated_date || '' }
}
const saveClicks = async (site: Website) => {
  const draft = clickDrafts[site.id]
  if (!draft) return
  const patch = { daily_clicks: draft.exact ?? null, daily_clicks_range: draft.exact != null ? null : draft.range || null, clicks_updated_date: draft.date || null }
  const saved = await saveSite(site, patch)
  if (saved) clickEditorOpen[site.id] = false
}
const createSite = async () => {
  if (saving.value) return
  saving.value = true
  try {
    await createWebsite({ name: newSite.name, stage: '待评估', domain: { domain: newSite.domain, registrar: newSite.registrar, registrar_date: newSite.registrar_date, expiry_date: newSite.expiry_date, service_type: newSite.service_type } })
    createVisible.value = false; Object.assign(newSite, { name: '', domain: '', registrar: '', service_type: '网站', registrar_date: '', expiry_date: '' }); await load(true); ElMessage.success('网站已创建')
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '网站创建失败') }
  finally { saving.value = false }
}
const removeSite = async (site: Website) => {
  try { await confirmAction(`删除“${site.name}”及其网站、域名、任务和历史数据？`, '删除网站', { confirmButtonText: '删除网站' }); await deleteWebsite(site.id); await load(true); ElMessage.success('网站已删除') }
  catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '网站删除失败') }
}
watch(() => route.query.site, syncSelectedSite)
watch(websites, syncSelectedSite)
watch(activePortfolio, (value, previous) => {
  sortKey.value = ''; sortDirection.value = 'asc'
  if ((value === 'stopped') !== (previous === 'stopped')) clearSelection()
})
onActivated(() => { void load(true) })
</script>
