<template>
  <div class="workspace-page">
    <WorkspaceHeading title="网站总表" subtitle="网站、部署位置与开发资料">
      <template #context>
        <nav class="portfolio-stage-tabs site-view-tabs" aria-label="网站状态">
          <button
            v-for="tab in views"
            :key="tab.value"
            class="portfolio-stage-tab"
            :class="{ 'is-active': view === tab.value }"
            :aria-pressed="view === tab.value"
            @click="filter('view', tab.value === 'active' ? '' : tab.value)"
          >
            {{ tab.label }}</button
          ><button v-if="sortKey" class="portfolio-sort-reset" @click="sortKey = ''">恢复默认排序</button>
        </nav>
      </template>
      <el-button :loading="loading" @click="load(true)">刷新</el-button>
      <el-button type="primary" @click="createVisible = true">新增网站</el-button>
    </WorkspaceHeading>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <div v-if="accountError" class="page-error" role="alert">{{ accountError }}<el-button @click="load(true)">重试</el-button></div>
    <div class="site-toolbar">
      <div class="site-filters">
        <el-input v-model="search" clearable placeholder="搜索网站或域名" aria-label="搜索网站或域名" />
        <el-select
          :model-value="String(route.query.batch || '')"
          clearable
          filterable
          placeholder="全部批次"
          aria-label="网站批次筛选"
          @change="(value) => filter('batch', value)"
          ><el-option v-for="batch in batches" :key="batch.id" :label="batch.name" :value="String(batch.id)"
        /></el-select>
        <el-select
          :model-value="String(route.query.ownership || '')"
          clearable
          placeholder="全部归属"
          aria-label="网站归属筛选"
          @change="(value) => filter('ownership', value)"
          ><el-option v-for="value in ownerships" :key="value" :label="value" :value="value"
        /></el-select>
        <el-select
          :model-value="String(route.query.platform || '')"
          clearable
          placeholder="全部技术栈"
          aria-label="技术栈筛选"
          @change="(value) => filter('platform', value)"
          ><el-option v-for="value in platforms" :key="value" :label="value" :value="value"
        /></el-select>
        <el-select
          :model-value="String(route.query.stage || '')"
          clearable
          placeholder="全部阶段"
          aria-label="阶段筛选"
          @change="(value) => filter('stage', value)"
          ><el-option v-for="value in stages" :key="value" :label="value" :value="value"
        /></el-select>
        <el-select :model-value="String(route.query.new || '')" clearable placeholder="全部新站分类" aria-label="新站分类筛选" @change="(value) => filter('new', value)">
          <el-option label="新站" value="1" /><el-option label="普通站" value="0" />
        </el-select>
        <el-select
          :model-value="providerFilterValue"
          clearable
          filterable
          :filter-method="(query: string) => providerSearch = query"
          placeholder="全部服务商"
          aria-label="服务商筛选"
          @change="changeProviderFilter"
          @visible-change="visible => { if (!visible) providerSearch = '' }"
        >
          <template #label="{ label }"><ProviderIdentity v-if="selectedProviderAccount" :provider="selectedProviderAccount.provider" :provider-name="selectedProviderAccount.provider_name" :name="selectedProviderAccount.name" compact /><span v-else>{{ label }}</span></template>
          <el-option-group v-for="group in providerGroups" :key="group.label" :label="group.label">
            <el-option v-if="group.showAll" :label="`${group.label} · 全部账号`" :value="`provider:${group.label}`" />
            <el-option v-for="account in group.accounts" :key="account.id" :label="`${group.label} · ${account.name}`" :value="`account:${account.id}`">
              <ProviderIdentity :provider="account.provider" :provider-name="account.provider_name" :name="account.name" compact />
            </el-option>
          </el-option-group>
        </el-select>
      </div>
      <div class="site-results">
        <el-checkbox :model-value="adsOnly" aria-label="只显示已开通 AdSense 的网站"
          @change="value => filter('ads', value ? '1' : '')">Ads</el-checkbox>
        <span class="site-edit-hint">点击表格内容可修改</span>
        <span role="status">{{ visibleSites.length }} / {{ websites.length }} 个网站</span>
        <el-tag v-for="condition in activeFilters" :key="condition.key" closable @close="filter(condition.key, '')">{{ condition.label }}</el-tag>
        <el-button v-if="activeFilters.length" text @click="clearFilters">清除全部条件</el-button>
      </div>
    </div>
    <div v-if="selectedIds.size" class="portfolio-bulk-toolbar">
      <strong>已选 {{ selectedIds.size }} 个网站</strong
      ><el-button @click="copySelectedMarkdown">复制 Markdown</el-button
      ><el-button :disabled="busy" @click="openBulkSettings">批量设置</el-button
      ><el-button @click="batchVisible = true">加入批次</el-button
      ><el-button v-if="view !== 'stopped'" :loading="busy" @click="bulk({ lifecycle: 'stopped' })">停止经营</el-button
      ><el-button v-else :loading="busy" @click="bulk({ lifecycle: 'active' })">恢复经营</el-button
      ><el-button @click="selectedIds.clear()">取消选择</el-button>
    </div>
    <section class="portfolio-stage portfolio-list" :aria-busy="loading">
      <div ref="tableWrap" class="portfolio-table-wrap" tabindex="0" role="region" aria-label="网站总表，可横向滚动">
        <span role="status" aria-live="polite" class="page-muted">{{ maintenanceFeedback }}</span>
          <table class="portfolio-table site-table" :style="tableStyle">
          <caption class="sr-only">
            网站总表，共
            {{
              visibleSites.length
            }}
            个网站
          </caption>
          <colgroup>
            <col v-for="col in columns" :key="col.key" :style="{ width: `calc(${col.width}px + var(--site-extra) * ${col.grow || 0} + ${col.key === 'actions' ? 'var(--site-action-extra)' : '0px'})` }" />
          </colgroup>
          <thead>
            <tr>
              <th
                v-for="col in columns"
                :key="col.key"
                scope="col"
                :aria-sort="sortKey === col.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined"
              >
                <div class="site-header">
                  <el-checkbox
                    v-if="col.key === 'identity'"
                    :model-value="allSelected"
                    :indeterminate="selectedIds.size > 0 && !allSelected"
                    aria-label="选择当前结果中的全部网站"
                    @change="(value) => selectAll(Boolean(value))"
                  /><button v-if="col.key !== 'actions'" class="portfolio-sort-trigger" @click="toggleSort(col.key)">
                    {{ col.label
                    }}<span v-if="sortKey === col.key" aria-hidden="true">{{
                      sortDirection === 'asc' ? '↑' : '↓'
                    }}</span></button
                  ><span v-else>{{ col.label }}</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="site in visibleSites" :key="site.id">
              <td>
                <div class="site-identity">
                  <el-checkbox
                    :model-value="selectedIds.has(site.id)"
                    :aria-label="`选择网站：${site.name}`"
                    @change="(value) => select(site.id, Boolean(value))"
                  /><DomainFavicon :key="primaryDomain(site)?.domain" :domain-id="primaryDomain(site)?.id" />
                  <div>
                    <div class="site-name-row">
                      <button class="site-cell site-name" :title="site.name" @click="openSite(site)">{{ site.name }}</button>
                      <el-button native-type="button" text size="small" :icon="CopyDocument" :aria-label="`复制网站分析资料：${site.name}`" title="复制网站信息供 AI 分析" @click="copyMarkdown([site])" />
                    </div>
                    <div v-if="primaryDomain(site)" class="site-domain-links">
                      <a :href="`https://${primaryDomain(site)!.domain}`" :title="primaryDomain(site)!.domain"
                        target="_blank" rel="noopener noreferrer">{{ primaryDomain(site)!.domain }}</a>
                      <a class="site-index-link"
                        :href="`https://www.google.com/search?q=${encodeURIComponent(`site:${primaryDomain(site)!.domain}`)}`"
                        :title="`Google 收录查询：site:${primaryDomain(site)!.domain}`"
                        :aria-label="`Google 收录查询：${primaryDomain(site)!.domain}（新标签页打开）`"
                        target="_blank" rel="noopener noreferrer"><el-icon aria-hidden="true"><Search /></el-icon></a>
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <button type="button" class="site-cell site-choice-trigger site-stack-trigger" :title="`${platformLabel(site)}，点击修改技术栈`" :aria-label="`技术栈：${site.name}`" :data-choice-key="`${site.id}-platform`" :aria-expanded="isChoice(site, 'platform')" aria-controls="website-choice-panel" :disabled="busy || loading || Boolean(metricEdit)" @click="openChoice(site, 'platform', $event)"><TechStackIcon :platform="site.platform" /><span class="sr-only">{{ platformLabel(site) }}</span></button>
              </td>
              <td v-for="key in countKeys" :key="key">
                <button
                  class="site-cell"
                  :title="
                    site.content_stats_updated_date ? `统计日期：${site.content_stats_updated_date}` : '未记录统计日期'
                  "
                  :aria-label="`编辑${metricLabels[key]}：${site.name}`"
                  :disabled="busy || loading"
                  @click="openMetric(site, key, $event)"
                >
                  {{ site[key] ?? '—' }}
                </button>
              </td>
              <td>
                <button class="site-cell" :title="site.clicks_updated_date || '未记录统计日期'" :aria-label="`编辑日点击：${site.name}`" :disabled="busy || loading" @click="openMetric(site, 'daily_clicks', $event)">
                  {{ clickLabel(site) }}
                </button>
              </td>
              <td>
                <button type="button" class="site-cell site-choice-trigger" :aria-label="`服务商：${site.name}`" :data-choice-key="`${site.id}-service`" :aria-expanded="isChoice(site, 'service')" aria-controls="website-choice-panel" :title="'点击修改服务账号'" :disabled="busy || loading || !!accountError || Boolean(metricEdit)" @click="openChoice(site, 'service', $event)">
                  <ProviderIdentity v-if="directAccounts(site, false).length === 1" :provider="directAccounts(site, false)[0]!.provider" :provider-name="directAccounts(site, false)[0]!.provider_name" :name="directAccounts(site, false)[0]!.name" compact />
                  <span v-else :class="{ 'site-choice-empty-value': !directAccounts(site, false).length }">{{ accountSummary(site, false) }}</span>
                </button>
              </td>
              <td>
                <button type="button" class="site-cell site-choice-trigger" :aria-label="`GitHub：${site.name}`" :data-choice-key="`${site.id}-github`" :aria-expanded="isChoice(site, 'github')" aria-controls="website-choice-panel" title="点击修改 GitHub 账号" :disabled="busy || loading || !!accountError || Boolean(metricEdit)" @click="openChoice(site, 'github', $event)">
                  <ProviderIdentity v-if="directAccounts(site, true).length === 1" provider="github" :name="directAccounts(site, true)[0]!.name" compact />
                  <span v-else :class="{ 'site-choice-empty-value': !directAccounts(site, true).length }">{{ accountSummary(site, true) }}</span>
                </button>
              </td>
              <td>
                <button type="button" class="site-cell site-choice-trigger" :aria-label="`电脑：${site.name}`" :data-choice-key="`${site.id}-computer`" :aria-expanded="isChoice(site, 'computer')" aria-controls="website-choice-panel" :title="site.computer_name || '未设置电脑，点击设置'" :disabled="busy || loading || Boolean(metricEdit)" @click="openChoice(site, 'computer', $event)"><ComputerIdentity v-if="site.computer_name" :name="site.computer_name" /><span v-else class="site-choice-empty-value">—</span></button>
              </td>
              <td>
                <span v-if="site.adsense_connected === '已开通'" class="site-adsense-total"
                  :title="`网站累计美元收入（USD，不换算）：${usdTotalLabel(site)}`"
                  :aria-label="`网站累计美元收入：${usdTotalLabel(site)}`">{{ usdTotalLabel(site) }}</span>
                <span v-if="site.adsense_connected === '已开通' && site.adsense_account_name"
                  class="site-adsense-account" :title="`AdSense：${site.adsense_account_name}`">{{ site.adsense_account_name }}</span>
                <span v-else class="site-adsense-status" :class="{ 'is-connected': site.adsense_connected === '已开通' }"
                  role="img" :aria-label="`AdSense：${site.adsense_connected || '未知'}`"
                  :title="`AdSense：${site.adsense_connected || '未知'}`">
                  <el-icon aria-hidden="true"><Check v-if="site.adsense_connected === '已开通'" /><Close v-else /></el-icon>
                </span>
              </td>
              <td class="site-stage-cell">
                <button type="button" class="site-cell site-choice-trigger" :aria-label="`阶段：${site.name}`" :data-choice-key="`${site.id}-stage`" :aria-expanded="isChoice(site, 'stage')" aria-controls="website-choice-panel" :aria-describedby="site.is_new_site ? `site-new-${site.id}` : undefined" title="点击修改阶段" :disabled="busy || loading || Boolean(metricEdit)" @click="openChoice(site, 'stage', $event)">{{ site.stage }}</button><small v-if="site.is_new_site" :id="`site-new-${site.id}`" class="site-new-label" :title="site.new_site_override === 1 ? '手动标记为新站' : '主域名注册日期在最近三个月内'">新站</small>
              </td>
              <td>
                <div class="site-actions">
                  <el-button
                    text
                    size="small"
                    :icon="View"
                    aria-label="详情"
                    title="查看详情"
                    @click="openSite(site)"
                  />
                  <a v-if="websiteMaintenance(site).kind === 'login'" class="el-button el-button--small is-text"
                    :href="websiteMaintenance(site).url" target="_blank" rel="noopener noreferrer"
                    :aria-label="`登录后台：${site.name}`" title="打开 WordPress 自定义后台"><el-icon aria-hidden="true"><Link /></el-icon></a>
                  <el-button v-else text size="small" :icon="websiteMaintenance(site).kind === 'github' ? CopyDocument : Setting"
                    :aria-label="`${websiteMaintenance(site).label}：${site.name}`"
                    :aria-busy="copying === site.id" :title="websiteMaintenance(site).label"
                    @click="websiteMaintenance(site).kind === 'github' ? copySite(site) : openSite(site, 'deployment')" />
                  <el-dropdown trigger="click" @command="(command) => more(site, String(command))"
                    ><el-button
                      text
                      size="small"
                      :icon="MoreFilled"
                      :aria-label="`${site.name} 更多操作`"
                      title="更多操作"
                    />
                    <template #dropdown
                      ><el-dropdown-menu
                        ><el-dropdown-item :command="site.lifecycle === 'active' ? 'stop' : 'restore'">{{
                          site.lifecycle === 'active' ? '停止经营' : '恢复经营'
                        }}</el-dropdown-item
                        ><el-dropdown-item command="batch">加入批次</el-dropdown-item
                        ><el-dropdown-item command="delete" divided>删除网站</el-dropdown-item></el-dropdown-menu
                      ></template
                    ></el-dropdown
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="loading && !websites.length" class="portfolio-empty">正在加载网站…</p>
      <div v-else-if="!error && !visibleSites.length" class="portfolio-empty">
        <template v-if="!websites.length">还没有网站，点击新增网站开始管理。</template>
        <template v-else>没有符合条件的网站。<el-button text @click="clearFilters">清除筛选</el-button></template>
      </div>
    </section>
    <p role="status" class="sr-only">
      {{
        sortKey
          ? `已按${columns.find((c) => c.key === sortKey)?.label}${sortDirection === 'asc' ? '升序' : '降序'}排列`
          : ''
      }}
    </p>
    <WebsiteDetailDrawer v-model:visible="detailVisible" :website="selectedSite" @changed="load(true)" />
    <WebsiteBulkSettingsDialog v-model:visible="bulkSettingsVisible" :websites="bulkSettingsSites" :computer-names="websites.map(site=>site.computer_name || '')" @saved="bulkSettingsSaved" />
    <BatchAssignmentDialog
      v-model="batchVisible"
      :websites="websites"
      :batches="batches"
      :selected-website-ids="[...selectedIds]"
      :submitting="busy"
      @submit="assignSelectedBatch"
    />
    <WebsiteChoiceEditor v-if="choiceEdit" :key="`${choiceEdit.site.id}-${choiceEdit.field}`" :label="choiceLabels[choiceEdit.field]" :website-name="choiceEdit.site.name" :anchor="choiceEdit.anchor" :options="choiceOptions" :current="choiceCurrent" :searchable="choiceEdit.field !== 'stage'" :allow-create="choiceEdit.field === 'computer' || choiceEdit.field === 'platform'" :busy="busy" :error="choiceError" @choose="saveChoice" @cancel="closeChoice" />
    <WebsiteMetricEditor v-if="metricEdit" :key="`${metricEdit.site.id}-${metricEdit.field}`" :website="metricEdit.site" :field="metricEdit.field" :label="metricLabels[metricEdit.field]" :anchor="metricEdit.anchor" :busy="busy" @save="saveMetric" @cancel="closeMetric" />
    <el-dialog v-model="createVisible" title="新增网站" width="min(560px,94vw)"
      ><el-form label-position="top" @submit.prevent="createSite"
        ><el-form-item v-for="field in createFields" :key="field.key" :label="field.label"
          ><el-input v-model="newSite[field.key]" :type="field.key.endsWith('date') ? 'date' : 'text'" /></el-form-item
        ><el-button type="primary" :loading="busy" native-type="submit">创建网站</el-button></el-form
      ></el-dialog
    >
  </div>
</template>
<script setup lang="ts">
import { websiteStages } from '../../shared/website-classification'
import { websiteMaintenance } from '../../shared/website-maintenance'
import { websiteEditPatch } from '../../shared/website-edits'
import { computed, reactive, ref, shallowRef, watch, onActivated, onDeactivated, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, CopyDocument, MoreFilled, Search, Check, Close, Link, Setting } from '@element-plus/icons-vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteMetricEditor from '../components/WebsiteMetricEditor.vue'
import { sortComputerNames } from '../utils/computer-options'
import WebsiteDetailDrawer from '../components/WebsiteDetailDrawer.vue'
import BatchAssignmentDialog from '../components/BatchAssignmentDialog.vue'
import WebsiteBulkSettingsDialog from '../components/WebsiteBulkSettingsDialog.vue'
import DomainFavicon from '../components/DomainFavicon.vue'
import TechStackIcon from '../components/TechStackIcon.vue'
import ComputerIdentity from '../components/ComputerIdentity.vue'
import ProviderIdentity from '../components/ProviderIdentity.vue'
import WebsiteChoiceEditor, { type ChoiceValue, type WebsiteChoiceOption } from '../components/WebsiteChoiceEditor.vue'
import type { ProviderAccount } from '../../functions/types'
import { providerIdentity } from '../utils/provider-identity'
import {
  getWebsites,
  setWebsiteAccount,
  createWebsite,
  updateWebsite,
  deleteWebsite,
  bulkUpdateWebsites,
  type Website
} from '../api/websites'
import { getBatches, assignBatch, type Batch, type BatchAssignmentPayload } from '../api/batches'
import { websiteQuery, type WebsiteSection } from '../utils/website-location'
import { api } from '../utils/request'
import { copyText } from '../utils/clipboard'
import { websitesMarkdown } from '../utils/website-markdown'
import { confirmAction, isDismissed } from '../utils/feedback'
import { cachedGet, localDate } from '../utils/workspaceCache'
import '../styles/home/home.css'
const route = useRoute()
const router = useRouter()
const stages = websiteStages
const platforms = ['WordPress', 'Astro', 'Next.js', '其他']
const ownerships = ['自营网站', '企业客户网站', '未分类']
const countKeys = ['page_count', 'calculator_count', 'article_count'] as const
const columns = [
  { key: 'identity', label: '网站 / 主域名', width: 240, grow: 0.25 },
  { key: 'platform', label: '技术栈', width: 56 },
  { key: 'page_count', label: '总页面数', width: 78 },
  { key: 'calculator_count', label: '计算器数量', width: 90 },
  { key: 'article_count', label: '文章数量', width: 78 },
  { key: 'clicks', label: '日点击', width: 88 },
  { key: 'provider', label: '服务商', width: 144, grow: 0.30 },
  { key: 'github', label: 'GitHub', width: 144, grow: 0.30 },
  { key: 'computer', label: '电脑', width: 120, grow: 0.15 },
  { key: 'adsense', label: 'AdSense', width: 112 },
  { key: 'stage', label: '阶段', width: 80 },
  { key: 'actions', label: '操作', width: 100 }
]
const tableWrap = ref<HTMLElement>()
const tableBaseWidth = columns.reduce((sum, column) => sum + column.width, 0)
const tableWidth = ref(tableBaseWidth), touchLayout = ref(false)
const tableStyle = computed(() => ({
  minWidth: `${tableBaseWidth + (touchLayout.value ? 44 : 0)}px`,
  '--site-action-extra': `${touchLayout.value ? 44 : 0}px`,
  '--site-extra': `${Math.max(0, tableWidth.value - tableBaseWidth - (touchLayout.value ? 44 : 0))}px`
}))
let tableObserver: ResizeObserver | undefined
const touchMedia = window.matchMedia('(max-width: 640px), (pointer: coarse)')
const measureTable = () => { tableWidth.value = tableWrap.value?.clientWidth || tableBaseWidth; touchLayout.value = touchMedia.matches }
onMounted(() => {
  measureTable()
  tableObserver = new ResizeObserver(measureTable)
  if (tableWrap.value) tableObserver.observe(tableWrap.value)
  touchMedia.addEventListener('change', measureTable)
})
onUnmounted(() => { tableObserver?.disconnect(); touchMedia.removeEventListener('change', measureTable) })
type ChoiceField = 'platform' | 'service' | 'github' | 'computer' | 'stage'
const choiceLabels: Record<ChoiceField, string> = { platform: '技术栈', service: '服务商', github: 'GitHub', computer: '电脑', stage: '阶段' }
const choiceEdit = shallowRef<{ site: Website; field: ChoiceField; anchor: HTMLElement }>()
const choiceError = ref('')
const isChoice = (site: Website, field: ChoiceField) => choiceEdit.value?.site.id === site.id && choiceEdit.value?.field === field

type MetricField = (typeof countKeys)[number] | 'daily_clicks'
const metricLabels: Record<MetricField, string> = { page_count: '总页面数', calculator_count: '计算器数量', article_count: '文章数量', daily_clicks: '日点击' }
const metricEdit = shallowRef<{ site: Website; field: MetricField; anchor: HTMLElement }>()
const batches = ref<Batch[]>([])
const websites = ref<Website[]>([])
const accounts = ref<ProviderAccount[]>([])
const accountError = ref('')
const loading = ref(false)
const error = ref('')
const search = computed({ get: () => String(route.query.q || ''), set: value => { const query = { ...route.query }; if (value) query.q = value; else delete query.q; void router.replace({ query }) } })
const busy = ref(false)
const copying = ref<number>()
const selectedIds = reactive(new Set<number>())
const bulkSettingsVisible = ref(false)
const bulkSettingsSites = ref<Website[]>([])
const openBulkSettings = () => {
  if (selectedIds.size > 200) { ElMessage.error('每次最多设置 200 个网站'); return }
  bulkSettingsSites.value = websites.value.filter(site=>selectedIds.has(site.id))
  bulkSettingsVisible.value = true
}
const bulkSettingsSaved = () => { selectedIds.clear(); void load(true) }
const batchVisible = ref(false)
const createVisible = ref(false)
const sortKey = computed({ get: () => columns.some(column => column.key !== 'actions' && column.key === route.query.sort) ? String(route.query.sort) : '', set: value => { const query = { ...route.query }; if (value) query.sort = value; else { delete query.sort; delete query.direction }; void router.replace({ query }) } })
const adsOnly = computed(() => route.query.ads === '1')
const sortDirection = computed(() => route.query.direction === 'desc' ? 'desc' : 'asc')
const filterLabels: Record<string, string> = { batch: '批次', ownership: '归属', platform: '技术栈', stage: '阶段', provider: '服务商', resource: '资源', provider_account: '服务账号', adsense_account: 'AdSense 账号', ads: 'Ads', new: '新站分类', view: '状态', q: '搜索' }
const activeFilters = computed(() => Object.entries(filterLabels).filter(([key]) => key === 'ads' ? adsOnly.value : route.query[key]).map(([key, label]) => ({ key, label: `${label}：${key === 'ads' ? '已开通' : key === 'new' ? route.query.new === '0' ? '普通站' : '新站' : key === 'view' ? '停止经营' : key === 'batch' ? batches.value.find(batch => batch.id === Number(route.query.batch))?.name || route.query.batch : key === 'provider_account' ? providerAccountFilterLabel.value : route.query[key]}` })))
const clearFilters = () => { const query = { ...route.query }; for (const key of Object.keys(filterLabels)) delete query[key]; void router.push({ query }) }
const views = [
  { value: 'active', label: '经营中' },
  { value: 'stopped', label: '停止经营' }
]
const view = computed(() => (route.query.view === 'stopped' ? 'stopped' : 'active'))
const serviceProviders = (site: Website) => {
  const accounts = (site.provider_accounts || []).filter(account => account.provider !== 'github').map(account => ({
    ...account, key: `account-${account.id}`, label: providerIdentity(account.provider, account.provider_name, account.name).label
  }))
  const hosting = site.hosting
  if (hosting) {
    const label = providerIdentity(hosting.provider, hosting.provider_name).label
    if (!accounts.some(account => hosting.account_id != null ? account.id === hosting.account_id : account.provider === hosting.provider && account.label === label)) {
      accounts.push({ id: hosting.id, key: `hosting-${hosting.id}`, provider: hosting.provider, provider_name: label, name: label, label })
    }
  }
  return accounts
}
const providerNames = computed(() => [...new Set(websites.value.flatMap(site => serviceProviders(site).map(account => account.label)))].sort())
const filterAccounts = computed(() => [...new Map([
  ...websites.value.flatMap(site => site.provider_accounts || []), ...accounts.value
].map(account => [account.id, account] as const)).values()])
const selectedProviderAccount = computed(() => filterAccounts.value.find(account => account.id === Number(route.query.provider_account)))
const providerAccountFilterLabel = computed(() => {
  const account = selectedProviderAccount.value
  if (!account) return route.query.provider_account
  const { label, accountName } = providerIdentity(account.provider, account.provider_name, account.name)
  return `${label}${accountName ? ` · ${accountName.split('@')[0]}` : ''}`
})
const providerSearch = ref('')
const providerGroups = computed(() => {
  const serviceAccounts = filterAccounts.value.filter(account => account.provider !== 'github')
  const labelOf = (account: typeof serviceAccounts[number]) => providerIdentity(account.provider, account.provider_name, account.name).label
  const query = providerSearch.value.trim().toLocaleLowerCase()
  return [...new Set([...providerNames.value, ...serviceAccounts.map(labelOf)])].sort().map(label => ({
    label, showAll: `${label} 全部账号`.toLocaleLowerCase().includes(query),
    accounts: serviceAccounts.filter(account => labelOf(account) === label && `${label} ${account.name} ${'login_email' in account ? account.login_email || '' : ''}`.toLocaleLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name))
  })).filter(group => group.showAll || group.accounts.length)
})
const providerFilterValue = computed(() => route.query.provider_account ? `account:${route.query.provider_account}` : route.query.provider ? `provider:${route.query.provider}` : '')
const changeProviderFilter = (value: string) => {
  const query = { ...route.query }
  delete query.provider
  delete query.provider_account
  delete query.site
  delete query.section
  if (value.startsWith('account:')) query.provider_account = value.slice('account:'.length)
  else if (value.startsWith('provider:')) query.provider = value.slice('provider:'.length)
  void router.push({ query })
}
const computerNames = computed(() => sortComputerNames(websites.value.map(site => site.computer_name)))
const primaryDomain = (site: Website) => site.domains.find((d) => d.is_primary) || site.domains[0]
const platformLabel = (site: Website) => (site.platform === '其他' ? site.platform_other || '其他' : site.platform)
const directAccounts = (site: Website, github: boolean) => (site.provider_accounts || []).filter(account => site.direct_account_ids?.includes(account.id) && (account.provider === 'github') === github)
const accountSummary = (site: Website, github: boolean) => { const count = directAccounts(site, github).length; return count ? `多个账号（${count}）` : '—' }
const clickRanges: Record<string, string> = { under10: '＜10', '10to29': '10–29', '30to49': '30–49', '50to99': '50–99', over100: '≥100' }
const clickRange = (count: number) => count < 10 ? 'under10' : count < 30 ? '10to29' : count < 50 ? '30to49' : count < 100 ? '50to99' : 'over100'
const clickLabel = (site: Website) => site.daily_clicks != null
  ? `${clickRanges[clickRange(site.daily_clicks)]}（${site.daily_clicks}）`
  : clickRanges[site.daily_clicks_range || ''] || '—'
const usdTotal = (site: Website) => site.income_totals?.find(item => item.currency === 'USD')?.amount
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdTotalLabel = (site: Website) => { const amount = usdTotal(site); return amount == null ? '—' : usdFormatter.format(amount) }
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const sortValue = (s: Website, key: string): string | number =>
  countKeys.includes(key as (typeof countKeys)[number])
    ? (s[key as (typeof countKeys)[number]] ?? -1)
    : ((
        {
          identity: s.name,
          platform: s.platform,
          clicks:
            s.daily_clicks ??
            ({ under10: 0, '10to29': 10, '30to49': 30, '50to99': 50, over100: 100 } as Record<string, number>)[
              s.daily_clicks_range || ''
            ] ??
            -1,
          provider: directAccounts(s, false).map(account => `${providerIdentity(account.provider, account.provider_name).label} ${account.name}`).join(' '),
          github: directAccounts(s, true).map(account => account.name).join(' '),
          computer: s.computer_name || '',
          adsense: s.adsense_connected === '已开通' ? usdTotal(s) ?? -1 : -2,
          stage: stages.indexOf(s.stage)
        } as Record<string, string | number>
      )[key] ?? '')
const visibleSites = computed(() =>
  websites.value
    .filter(
      (s) =>
        s.lifecycle === view.value &&
        (!route.query.batch || s.batch_ids?.includes(Number(route.query.batch))) &&
        (!route.query.stage || s.stage === route.query.stage) &&
        (!route.query.ownership || s.ownership === route.query.ownership) &&
        (!route.query.platform || s.platform === route.query.platform) &&
        (!route.query.provider || serviceProviders(s).some(account => account.label === route.query.provider)) &&
        (!route.query.resource || s.resource_ids?.includes(Number(route.query.resource))) &&
        (!route.query.provider_account || s.provider_account_ids?.includes(Number(route.query.provider_account)) || s.provider_accounts?.some(account => account.id === Number(route.query.provider_account))) &&
        (!route.query.adsense_account || s.adsense_account_id === Number(route.query.adsense_account)) &&
        (!adsOnly.value || s.adsense_connected === '已开通') &&
        (route.query.new === '1' ? s.is_new_site : route.query.new === '0' ? !s.is_new_site : true) &&
        `${s.name} ${s.domains.map((d) => d.domain).join(' ')}`
          .toLowerCase()
          .includes(search.value.trim().toLowerCase())
    )
    .sort((a, b) => {
      if (!sortKey.value) return a.priority_order - b.priority_order || a.id - b.id
      const x = sortValue(a, sortKey.value),
        y = sortValue(b, sortKey.value)
      return (
        ((typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))) ||
          (sortKey.value === 'adsense' && a.adsense_connected === '已开通' && b.adsense_connected === '已开通'
            ? collator.compare(a.adsense_account_name || '', b.adsense_account_name || '') : 0)) *
        (sortDirection.value === 'asc' ? 1 : -1)
      )
    })
)
const allSelected = computed(
  () => visibleSites.value.length > 0 && visibleSites.value.every((s) => selectedIds.has(s.id))
)
const select = (id: number, value: boolean) => {
  if (value) selectedIds.add(id)
  else selectedIds.delete(id)
}
const selectAll = (value: boolean) => visibleSites.value.forEach((s) => select(s.id, value))
watch(visibleSites, (sites) => {
  const ids = new Set(sites.map((s) => s.id))
  for (const id of selectedIds) if (!ids.has(id)) selectedIds.delete(id)
})
const filter = (key: string, value: string) => {
  const query = { ...route.query }
  delete query.site
      delete query.section
  if (value) query[key] = value
  else delete query[key]
  void router.push({ query })
}
const toggleSort = (key: string) => {
  void router.replace({ query: { ...route.query, sort: key, direction: sortKey.value === key && sortDirection.value === 'asc' ? 'desc' : 'asc' } })
}
const selectedSite = computed(() => websites.value.find((s) => s.id === Number(route.query.site)))
const detailVisible = computed({
  get: () => Boolean(selectedSite.value),
  set: (value) => {
    if (!value) {
      const query = { ...route.query }
      delete query.site
      delete query.section
      void router.replace({ query })
    }
  }
})
const openSite = (site: Website, section: WebsiteSection = 'basic') => {
  void router.push({ query: websiteQuery(site.id, section, route.query) })
}
const load = async (force = false) => {
  loading.value = true
  error.value = ''
  try {
    const [siteResult, accountResult] = await Promise.allSettled([getWebsites(force), cachedGet<ProviderAccount[]>('/api/resources/accounts', force)])
    if (siteResult.status === 'rejected') throw siteResult.reason
    websites.value = siteResult.value
    accountError.value = accountResult.status === 'rejected' ? '服务账号读取失败，请重试' : ''
    accounts.value = accountResult.status === 'fulfilled' ? accountResult.value : []
    try { batches.value = await getBatches(force) } catch { ElMessage.warning('批次暂时无法读取，网站仍可查看') }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '网站加载失败'
  } finally {
    loading.value = false
  }
}
const run = async (action: () => Promise<void>) => {
  if (busy.value) return
  busy.value = true
  try {
    await action()
    await load(true)
  } catch (e) {
    if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    busy.value = false
  }
}
const choiceCurrent = computed<ChoiceValue>(() => {
  const edit = choiceEdit.value
  if (!edit) return null
  if (edit.field === 'service' || edit.field === 'github') { const accounts = directAccounts(edit.site, edit.field === 'github'); return accounts.length > 1 ? -1 : accounts[0]?.id ?? null }
  return edit.field === 'computer' ? edit.site.computer_name || null : edit.field === 'platform' ? platformLabel(edit.site) : edit.site.stage
})
const choiceOptions = computed<WebsiteChoiceOption[]>(() => {
  const edit = choiceEdit.value
  if (!edit) return []
  if (edit.field === 'stage') return stages.map(value => ({ value, label: value }))
  if (edit.field === 'platform') return [...new Set([...platforms, platformLabel(edit.site)])].map(value => ({ value, label: value, platform: value }))
  if (edit.field === 'computer') return [{ value: null, label: '清空电脑' }, ...computerNames.value.map(value => ({ value, label: value, computer: value }))]
  return [{ value: null, label: '不关联账号' }, ...accounts.value.filter(account => (account.provider === 'github') === (edit.field === 'github') && (account.status !== '停用' || edit.site.direct_account_ids?.includes(account.id!))).map(account => ({ value: account.id!, label: account.name, search: `${providerIdentity(account.provider, account.provider_name).label} ${account.login_email || ''}`, provider: account.provider, providerName: account.provider_name, name: account.name, disabled: account.status === '停用' }))]
})
const openChoice = (site: Website, field: ChoiceField, event: MouseEvent) => {
  if (busy.value || loading.value || metricEdit.value) return
  if (isChoice(site, field)) { closeChoice(); return }
  choiceError.value = ''
  choiceEdit.value = { site, field, anchor: event.currentTarget as HTMLElement }
}
const closeChoice = (restoreFocus = true) => {
  const edit = choiceEdit.value
  if (!edit || busy.value) return
  choiceEdit.value = undefined
  choiceError.value = ''
  if (restoreFocus) void nextTick(() => (document.querySelector<HTMLElement>(`[data-choice-key="${edit.site.id}-${edit.field}"]`) || document.querySelector<HTMLElement>('.site-table .portfolio-sort-trigger'))?.focus({ preventScroll: true }))
}
const saveChoice = async (value: ChoiceValue) => {
  const edit = choiceEdit.value
  if (!edit || busy.value) return
  if (value === choiceCurrent.value) { closeChoice(); return }
  busy.value = true
  choiceError.value = ''
  try {
    if (edit.field === 'service' || edit.field === 'github') await setWebsiteAccount(edit.site.id, edit.field, value as number | null)
    else {
      const platform = typeof value === 'string' && platforms.includes(value) ? value : '其他'
      const fields = edit.field === 'computer' ? { computer_name: value || null } : edit.field === 'stage' ? { stage: value } : { platform, platform_other: platform === '其他' && value !== '其他' ? value : null }
      await updateWebsite(edit.site.id, websiteEditPatch(fields, edit.site))
    }
    await load(true)
    busy.value = false
    closeChoice()
    ElMessage.success('资料已保存')
  } catch (e) { choiceError.value = e instanceof Error ? e.message : '保存失败，请重试' }
  finally { busy.value = false }
}
const openMetric = (site: Website, field: MetricField, event: MouseEvent) => {
  if (busy.value || loading.value) return
  if (metricEdit.value) { ElMessage.warning('请先保存或取消当前编辑'); return }
  closeChoice(false)
  metricEdit.value = { site, field, anchor: event.currentTarget as HTMLElement }
}
const closeMetric = () => { const anchor = metricEdit.value?.anchor; metricEdit.value = undefined; anchor?.focus() }
watch(() => route.fullPath, () => { if (metricEdit.value) closeMetric(); closeChoice(false) })
onDeactivated(() => { choiceEdit.value = undefined })
const saveMetric = (fields: Record<string, unknown>) => {
  const edit = metricEdit.value
  if (!edit) return
  return run(async () => {
    if (Object.keys(fields).length) await updateWebsite(edit.site.id, fields)
    closeMetric()
    ElMessage.success('资料已保存')
  })
}
const bulk = (fields: Record<string, unknown>) =>
  run(async () => {
    await bulkUpdateWebsites([...selectedIds], fields)
    selectedIds.clear()
  })
const more = async (site: Website, command: string) => {
  if (command === 'batch') {
    selectedIds.clear()
    selectedIds.add(site.id)
    batchVisible.value = true
    return
  }
  await run(async () => {
    if (command === 'delete') {
      await confirmAction(`删除“${site.name}”及全部关联历史？`, '删除网站', { confirmButtonText: '删除网站' })
      await deleteWebsite(site.id)
    } else await updateWebsite(site.id, { lifecycle: command === 'stop' ? 'stopped' : 'active' })
  })
}
const assignSelectedBatch = (payload: BatchAssignmentPayload) =>
  run(async () => {
    await assignBatch(payload)
    batchVisible.value = false
    selectedIds.clear()
    ElMessage.success('已加入批次')
  })
const copySelectedMarkdown = async () => {
  const sites = visibleSites.value.filter(site => selectedIds.has(site.id))
  return copyMarkdown(sites)
}
const copyMarkdown = async (sites: Website[]) => {
  if (!sites.length) return
  try {
    await copyText(websitesMarkdown(sites, batches.value, localDate()))
    ElMessage.success(`已复制 ${sites.length} 个网站的 Markdown`)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '复制失败')
  }
}
const maintenanceFeedback = ref('')
const copySite = async (site: Website) => {
  if (copying.value) return
  copying.value = site.id
  try {
    const result = await api.post<{ text: string }>(`/api/websites/${site.id}/copy`, {})
    await copyText(result.text)
    maintenanceFeedback.value = `${site.name}：GitHub 推送资料已复制`
    ElMessage.success('GitHub 推送资料已复制')
  } catch (e) {
    maintenanceFeedback.value = e instanceof Error ? e.message : '复制失败'
    ElMessage.error(maintenanceFeedback.value)
    openSite(site, 'deployment')
  } finally {
    copying.value = undefined
  }
}
const createFields = [
  { key: 'name', label: '网站名称' },
  { key: 'domain', label: '主域名' },
  { key: 'registrar', label: '注册商' },
  { key: 'registrar_date', label: '注册日期' },
  { key: 'expiry_date', label: '到期日期' }
] as const
const newSite = reactive({ name: '', domain: '', registrar: '', registrar_date: '', expiry_date: '' })
const createSite = () =>
  run(async () => {
    await createWebsite({ name: newSite.name, domain: { ...newSite, service_type: '网站' } })
    createVisible.value = false
    Object.assign(newSite, { name: '', domain: '', registrar: '', registrar_date: '', expiry_date: '' })
  })
onActivated(() => {
  void load()
})
</script>
