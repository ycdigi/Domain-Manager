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
      ><el-button :disabled="busy" @click="openBulkSettings">批量设置</el-button
      ><el-button @click="batchVisible = true">加入批次</el-button
      ><el-button v-if="view !== 'stopped'" :loading="busy" @click="bulk({ lifecycle: 'stopped' })">停止经营</el-button
      ><el-button v-else :loading="busy" @click="bulk({ lifecycle: 'active' })">恢复经营</el-button
      ><el-button @click="selectedIds.clear()">取消选择</el-button>
    </div>
    <section class="portfolio-stage portfolio-list" :aria-busy="loading">
      <p id="table-scroll-hint" class="site-scroll-hint">左右滚动查看完整资料；宽屏下网站和操作固定。</p>
      <div class="portfolio-table-wrap" tabindex="0" role="region" aria-label="网站总表，可横向滚动" aria-describedby="table-scroll-hint">
        <table class="portfolio-table site-table" :style="{ minWidth: columns.reduce((sum, col) => sum + col.width, 0) + 'px' }">
          <caption class="sr-only">
            网站总表，共
            {{
              visibleSites.length
            }}
            个网站
          </caption>
          <colgroup>
            <col v-for="col in columns" :key="col.key" :style="{ width: col.width + 'px' }" />
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
                    <button class="site-cell site-name" @click="openSite(site)">{{ site.name }}</button
                    >
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
                <button
                  class="site-cell site-platform-icon"
                  :aria-label="`技术栈：${platformLabel(site)}，编辑网站`"
                  :title="platformLabel(site)"
                  @click="openSite(site)"
                >
                  <TechStackIcon :platform="site.platform" />
                </button>
              </td>
              <td v-for="key in countKeys" :key="key">
                <button
                  class="site-cell"
                  :title="
                    site.content_stats_updated_date ? `统计日期：${site.content_stats_updated_date}` : '未记录统计日期'
                  "
                  @click="openSite(site, 'content')"
                >
                  {{ site[key] ?? '—' }}
                </button>
              </td>
              <td>
                <form v-if="site.daily_clicks == null && !site.daily_clicks_range || clickEditingIds.has(site.id)"
                  class="site-clicks-editor" @submit.prevent="saveClicks(site)">
                  <el-input :id="`site-clicks-${site.id}`" :model-value="clickDrafts[site.id] ?? ''"
                    type="number" inputmode="numeric" :min="0" :step="1" size="small" placeholder="回车保存"
                    :aria-label="`日点击：${site.name}`" title="输入非负整数，回车保存，Esc 取消"
                    :disabled="clickSavingIds.has(site.id)" @update:model-value="value => clickDrafts[site.id] = value"
                    @keydown="event => clicksKeydown(site, event as KeyboardEvent)">
                    <template #suffix><button class="site-clicks-save" type="submit" :aria-label="`保存日点击：${site.name}`"
                      :disabled="clickSavingIds.has(site.id)"><el-icon aria-hidden="true"><Check /></el-icon></button></template>
                  </el-input>
                </form>
                <button v-else class="site-cell site-clicks-value" :title="`${site.clicks_updated_date || '未记录统计日期'}；点击修改`" @click="editClicks(site)">
                  {{ clickLabel(site) }}
                </button>
              </td>
              <td>
                <button class="site-cell site-provider-cell" @click="openSite(site, 'deployment')">
                  <ProviderIdentity v-for="account in serviceProviders(site)" :key="account.key"
                    :provider="account.provider" :provider-name="account.provider_name" :name="account.name" compact />
                  <span v-if="!serviceProviders(site).length">—</span>
                </button>
              </td>
              <td>
                <div class="site-provider-cell">
                  <template v-for="entry in githubEntries(site)" :key="entry.key">
                    <a v-if="entry.url" :href="entry.url" :title="entry.url" target="_blank" rel="noopener noreferrer">
                      <ProviderIdentity provider="github" :name="entry.name" compact />
                    </a>
                    <button v-else class="site-cell" @click="openSite(site, 'deployment')">
                      <ProviderIdentity provider="github" :name="entry.name" compact />
                    </button>
                  </template>
                  <button v-if="!githubEntries(site).length" class="site-cell" @click="openSite(site, 'deployment')">—</button>
                </div>
              </td>
              <td>
                <button
                  class="site-cell"
                  :disabled="!site.hosting?.ip_address"
                  title="复制服务器 IP"
                  @click="copyIp(site)"
                >
                  {{ site.hosting?.ip_address || '—' }}
                </button>
              </td>
              <td>
                <button class="site-cell" @click="openSite(site)">{{ site.computer_name || '—' }}</button>
              </td>
              <td>
                <span class="site-adsense-status" :class="{ 'is-connected': site.adsense_connected === '已开通' }"
                  role="img" :aria-label="`AdSense：${site.adsense_connected || '未知'}`"
                  :title="`AdSense：${site.adsense_connected || '未知'}`">
                  <el-icon aria-hidden="true"><Check v-if="site.adsense_connected === '已开通'" /><Close v-else /></el-icon>
                </span>
              </td>
              <td>
                <el-select class="site-stage-select" :model-value="site.stage" size="small"
                  :aria-label="`阶段：${site.name}`" :disabled="stageSavingIds.has(site.id)"
                  :loading="stageSavingIds.has(site.id)" @change="value => setStage(site, value)">
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
import { computed, reactive, ref, watch, onActivated, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, CopyDocument, MoreFilled, Search, Check, Close } from '@element-plus/icons-vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteDetailDrawer from '../components/WebsiteDetailDrawer.vue'
import BatchAssignmentDialog from '../components/BatchAssignmentDialog.vue'
import WebsiteBulkSettingsDialog from '../components/WebsiteBulkSettingsDialog.vue'
import DomainFavicon from '../components/DomainFavicon.vue'
import TechStackIcon from '../components/TechStackIcon.vue'
import ProviderIdentity from '../components/ProviderIdentity.vue'
import { providerIdentity } from '../utils/provider-identity'
import {
  getWebsites,
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
import { confirmAction, isDismissed } from '../utils/feedback'
import { localDate } from '../utils/workspaceCache'
import '../styles/home/home.css'
const route = useRoute()
const router = useRouter()
const stages: WebsiteStage[] = ['待评估', '验证', '增长', '维护', '暂停']
const platforms = ['WordPress', 'Astro', 'Next.js', '其他']
const ownerships = ['自营网站', '企业客户网站', '未分类']
const countKeys = ['page_count', 'calculator_count', 'article_count'] as const
const columns = [
  { key: 'identity', label: '网站 / 主域名', width: 245 },
  { key: 'platform', label: '技术栈', width: 80 },
  { key: 'page_count', label: '总页面数', width: 100 },
  { key: 'calculator_count', label: '计算器数量', width: 110 },
  { key: 'article_count', label: '文章数量', width: 100 },
  { key: 'clicks', label: '日点击', width: 140 },
  { key: 'provider', label: '服务商', width: 120 },
  { key: 'github', label: 'GitHub', width: 160 },
  { key: 'ip', label: '服务器 IP', width: 150 },
  { key: 'computer', label: '电脑', width: 130 },
  { key: 'adsense', label: 'AdSense', width: 90 },
  { key: 'stage', label: '阶段', width: 110 },
  { key: 'actions', label: '操作', width: 126 }
]
const batches = ref<Batch[]>([])
const websites = ref<Website[]>([])
const loading = ref(false)
const error = ref('')
const search = computed({ get: () => String(route.query.q || ''), set: value => { const query = { ...route.query }; if (value) query.q = value; else delete query.q; void router.replace({ query }) } })
const busy = ref(false)
const copying = ref<number>()
const stageSavingIds = reactive(new Set<number>())
const clickSavingIds = reactive(new Set<number>())
const clickEditingIds = reactive(new Set<number>())
const clickDrafts = reactive<Record<number, string>>({})
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
const sortKey = computed({ get: () => String(route.query.sort || ''), set: value => { const query = { ...route.query }; if (value) query.sort = value; else { delete query.sort; delete query.direction }; void router.replace({ query }) } })
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
const primaryDomain = (site: Website) => site.domains.find((d) => d.is_primary) || site.domains[0]
const platformLabel = (site: Website) => (site.platform === '其他' ? site.platform_other || '其他' : site.platform)
const safeExternal = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined)
const githubEntries = (site: Website) => {
  const url = safeExternal(site.repository?.resource_url || '')
  const entries = (site.provider_accounts || []).filter(account => account.provider === 'github').map(account => ({
    key: `account-${account.id}`, name: account.name, url: account.id === site.repository?.account_id ? url : undefined
  }))
  if (url && site.repository && !entries.some(entry => entry.url)) {
    entries.push({ key: `repository-${site.repository.id}`, name: site.repository.name, url })
  }
  return entries
}
const clickRanges: Record<string, string> = { under10: '＜10', '10to29': '10–29', '30to49': '30–49', '50to99': '50–99', over100: '≥100' }
const clickRange = (count: number) => count < 10 ? 'under10' : count < 30 ? '10to29' : count < 50 ? '30to49' : count < 100 ? '50to99' : 'over100'
const clickLabel = (site: Website) => site.daily_clicks != null
  ? `${clickRanges[clickRange(site.daily_clicks)]}（${site.daily_clicks}）`
  : clickRanges[site.daily_clicks_range || ''] || '—'
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
          provider: serviceProviders(s).map(account => `${account.label} ${account.name}`).join(' '),
          github: githubEntries(s).map(entry => entry.name).join(' '),
          ip: s.hosting?.ip_address || '',
          computer: s.computer_name || '',
          adsense: s.adsense_connected === '已开通' ? 1 : 0,
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
        (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))) *
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
    websites.value = await getWebsites(force)
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
const setStage = async (site: Website, stage: WebsiteStage) => {
  if (stage === site.stage || stageSavingIds.has(site.id)) return
  stageSavingIds.add(site.id)
  try {
    await updateWebsite(site.id, { stage })
    const current = websites.value.find(row => row.id === site.id)
    if (current) current.stage = stage
    ElMessage.success('阶段已更新')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '阶段保存失败')
  } finally {
    stageSavingIds.delete(site.id)
  }
}
const editClicks = async (site: Website) => {
  clickDrafts[site.id] = site.daily_clicks == null ? '' : String(site.daily_clicks)
  clickEditingIds.add(site.id)
  await nextTick()
  document.getElementById(`site-clicks-${site.id}`)?.focus()
}
const saveClicks = async (site: Website) => {
  if (clickSavingIds.has(site.id)) return
  const draft = (clickDrafts[site.id] || '').trim()
  const count = Number(draft)
  if (!draft || !Number.isSafeInteger(count) || count < 0) { ElMessage.error('请输入非负整数'); return }
  const fields = { daily_clicks: count, daily_clicks_range: null, clicks_updated_date: localDate() }
  clickSavingIds.add(site.id)
  try {
    await updateWebsite(site.id, fields)
    const current = websites.value.find(row => row.id === site.id)
    if (current) Object.assign(current, fields)
    clickEditingIds.delete(site.id)
    delete clickDrafts[site.id]
    ElMessage.success('日点击已更新')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '日点击保存失败')
  } finally {
    clickSavingIds.delete(site.id)
  }
}
const clicksKeydown = (site: Website, event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (!event.isComposing && event.keyCode !== 229) void saveClicks(site)
  } else if (event.key === 'Escape' && !event.isComposing && !clickSavingIds.has(site.id)) {
    event.preventDefault()
    clickEditingIds.delete(site.id)
    delete clickDrafts[site.id]
  }
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
const copyIp = async (site: Website) => {
  try {
    await copyText(site.hosting?.ip_address || '')
    ElMessage.success('服务器 IP 已复制')
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
