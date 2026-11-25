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
        <el-select
          :model-value="String(route.query.provider || '')"
          clearable
          placeholder="全部服务商"
          aria-label="服务商筛选"
          @change="(value) => filter('provider', value)"
          ><el-option v-for="value in providerNames" :key="value" :label="value" :value="value"
        /></el-select>
      </div>
      <div class="site-results">
        <el-checkbox :model-value="adsOnly" aria-label="只显示已开通 AdSense 的网站"
          @change="value => filter('ads', value ? '1' : '')">Ads</el-checkbox>
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
      <div class="portfolio-table-wrap" tabindex="0" role="region" aria-label="网站总表，可横向滚动">
        <table class="portfolio-table site-table" :style="{ minWidth: columns.reduce((sum, col) => sum + col.width, 0) + 'px' }">
          <caption class="sr-only">
            网站总表，共
            {{
              visibleSites.length
            }}
            个网站
          </caption>
          <colgroup>
            <col v-for="col in columns" :key="col.key" :style="col.key === 'identity' ? undefined : { width: col.width + 'px' }" />
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
                      <button class="site-cell site-name" @click="openSite(site)">{{ site.name }}</button>
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
                <el-select
                  class="site-stack-select"
                  :title="platformLabel(site)"
                  :model-value="platformLabel(site)"
                  :aria-label="`技术栈：${site.name}`"
                  :disabled="busy || loading || Boolean(metricEdit)"
                  filterable allow-create default-first-option
                  @change="(value: string) => changePlatform(site, value)"
                >
                  <template #label><TechStackIcon :platform="site.platform" /><span class="sr-only">{{ platformLabel(site) }}</span></template>
                  <el-option v-for="value in [...new Set([...platforms, platformLabel(site)])]" :key="value" :label="value" :value="value"><span class="site-stack-option"><TechStackIcon :platform="value" /><span>{{ value }}</span></span></el-option>
                </el-select>
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
                <WebsiteAccountSelect :site="site" kind="service" :accounts="accounts" :disabled="busy || loading || !!accountError || Boolean(metricEdit)" @change="id => changeAccount(site, 'service', id)" />
              </td>
              <td>
                <WebsiteAccountSelect :site="site" kind="github" :accounts="accounts" :disabled="busy || loading || !!accountError || Boolean(metricEdit)" @change="id => changeAccount(site, 'github', id)" />
              </td>
              <td>
                <el-select class="site-inline-select" :model-value="site.computer_name || ''" :aria-label="`电脑：${site.name}`" :disabled="busy || loading || Boolean(metricEdit)" filterable allow-create clearable default-first-option @change="(value: string) => changeComputer(site, value)">
                  <template #label><ComputerIdentity v-if="site.computer_name" :name="site.computer_name" /></template>
                  <el-option v-for="name in computerNames" :key="name" :label="name" :value="name"><ComputerIdentity :name="name" /></el-option>
                </el-select>
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
              <td>
                <el-select
                  class="site-stage-select"
                  :model-value="site.stage"
                  :disabled="busy || loading || Boolean(metricEdit)"
                  :aria-label="`阶段：${site.name}`"
                  title="选择后自动保存阶段"
                  @change="(stage: WebsiteStage) => changeStage(site, stage)"
                >
                  <el-option v-for="stage in stages" :key="stage" :label="stage" :value="stage" />
                </el-select>
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
                  <el-button
                    text
                    size="small"
                    :icon="CopyDocument"
                    aria-label="复制资料"
                    :disabled="!site.repository"
                    :loading="copying === site.id"
                    :title="site.repository ? '复制 GitHub 开发资料' : '请关联主要 GitHub 仓库'"
                    @click="copySite(site)"
                  />
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
import { websiteEditPatch } from '../../shared/website-edits'
import { computed, reactive, ref, shallowRef, watch, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, CopyDocument, MoreFilled, Search, Check, Close } from '@element-plus/icons-vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteMetricEditor from '../components/WebsiteMetricEditor.vue'
import { sortComputerNames } from '../utils/computer-options'
import WebsiteDetailDrawer from '../components/WebsiteDetailDrawer.vue'
import BatchAssignmentDialog from '../components/BatchAssignmentDialog.vue'
import WebsiteBulkSettingsDialog from '../components/WebsiteBulkSettingsDialog.vue'
import DomainFavicon from '../components/DomainFavicon.vue'
import TechStackIcon from '../components/TechStackIcon.vue'
import ComputerIdentity from '../components/ComputerIdentity.vue'
import WebsiteAccountSelect from '../components/WebsiteAccountSelect.vue'
import type { ProviderAccount } from '../../functions/types'
import { providerIdentity } from '../utils/provider-identity'
import {
  getWebsites,
  setWebsiteAccount,
  createWebsite,
  updateWebsite,
  deleteWebsite,
  bulkUpdateWebsites,
  type Website,
  type WebsiteStage
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
const stages: WebsiteStage[] = ['待评估', '验证', '增长', '维护', '暂停']
const platforms = ['WordPress', 'Astro', 'Next.js', '其他']
const ownerships = ['自营网站', '企业客户网站', '未分类']
const countKeys = ['page_count', 'calculator_count', 'article_count'] as const
const columns = [
  { key: 'identity', label: '网站 / 主域名', width: 225 },
  { key: 'platform', label: '技术栈', width: 76 },
  { key: 'page_count', label: '总页面数', width: 82 },
  { key: 'calculator_count', label: '计算器数量', width: 92 },
  { key: 'article_count', label: '文章数量', width: 82 },
  { key: 'clicks', label: '日点击', width: 86 },
  { key: 'provider', label: '服务商', width: 112 },
  { key: 'github', label: 'GitHub', width: 124 },
  { key: 'computer', label: '电脑', width: 130 },
  { key: 'adsense', label: 'AdSense', width: 100 },
  { key: 'stage', label: '阶段', width: 104 },
  { key: 'actions', label: '操作', width: 116 }
]
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
const filterLabels: Record<string, string> = { batch: '批次', ownership: '归属', platform: '技术栈', stage: '阶段', provider: '服务商', resource: '资源', provider_account: '服务账号', adsense_account: 'AdSense 账号', ads: 'Ads', new: '新站', view: '状态', q: '搜索' }
const activeFilters = computed(() => Object.entries(filterLabels).filter(([key]) => key === 'ads' ? adsOnly.value : route.query[key]).map(([key, label]) => ({ key, label: `${label}：${key === 'ads' ? '已开通' : key === 'new' ? '是' : key === 'view' ? '停止经营' : key === 'batch' ? batches.value.find(batch => batch.id === Number(route.query.batch))?.name || route.query.batch : route.query[key]}` })))
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
const computerNames = computed(() => sortComputerNames(websites.value.map(site => site.computer_name)))
const primaryDomain = (site: Website) => site.domains.find((d) => d.is_primary) || site.domains[0]
const platformLabel = (site: Website) => (site.platform === '其他' ? site.platform_other || '其他' : site.platform)
const directAccounts = (site: Website, github: boolean) => (site.provider_accounts || []).filter(account => site.direct_account_ids?.includes(account.id) && (account.provider === 'github') === github)
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
        (!route.query.provider_account || s.provider_account_ids?.includes(Number(route.query.provider_account))) &&
        (!route.query.adsense_account || s.adsense_account_id === Number(route.query.adsense_account)) &&
        (!adsOnly.value || s.adsense_connected === '已开通') &&
        (!route.query.new || s.is_new_site) &&
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
const saveInline = (site: Website, fields: Record<string, unknown>) => {
  if (loading.value || Object.entries(fields).every(([key, value]) => (site[key as keyof Website] ?? null) === value)) return
  return run(async () => {
    await updateWebsite(site.id, websiteEditPatch(fields, site))
    ElMessage.success('资料已保存')
  })
}
const changeAccount = (site: Website, kind: 'service' | 'github', id: number | null) => run(async () => {
  await setWebsiteAccount(site.id, kind, id)
  ElMessage.success('账号已保存')
})
const changeStage = (site: Website, stage: WebsiteStage) => saveInline(site, { stage })
const changeComputer = (site: Website, value: string | undefined) => saveInline(site, { computer_name: value?.trim() || null })
const changePlatform = (site: Website, value: string) => {
  const platform = platforms.includes(value) ? value : '其他'
  return saveInline(site, { platform, platform_other: platform === '其他' && value !== '其他' ? value : null })
}
const openMetric = (site: Website, field: MetricField, event: MouseEvent) => {
  if (busy.value || loading.value) return
  if (metricEdit.value) { ElMessage.warning('请先保存或取消当前编辑'); return }
  metricEdit.value = { site, field, anchor: event.currentTarget as HTMLElement }
}
const closeMetric = () => { const anchor = metricEdit.value?.anchor; metricEdit.value = undefined; anchor?.focus() }
watch(() => route.fullPath, () => { if (metricEdit.value) closeMetric() })
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
const copySite = async (site: Website) => {
  if (copying.value) return
  copying.value = site.id
  try {
    const result = await api.post<{ text: string }>(`/api/websites/${site.id}/copy`, {})
    await copyText(result.text)
    ElMessage.success('开发资料已复制')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '复制失败')
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
