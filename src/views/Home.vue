<template>
    <div class="home-container" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
        <main class="workspace">
            <div class="ledger-toolbar">
                <div class="ledger-search-top" role="search" aria-label="搜索网站"><el-input v-model="searchText" class="home-search" :prefix-icon="Search" placeholder="搜索域名、网站名称、类型、备注" clearable /></div>
                <div class="ledger-actions" aria-label="域名管理操作">
                    <el-button :icon="Refresh" :loading="refreshing" :disabled="loading || !!loadError" @click="handleRefresh">刷新</el-button>
                    <el-button :disabled="loading || !!loadError || detecting || !filteredDomains.length" :loading="detecting" @click="handleDetect">检测网站状态（{{ filteredDomains.length }}）</el-button>
                    <el-button type="primary" :icon="Plus" @click="handleAdd">新增域名</el-button>
                    <el-button :icon="Upload" @click="handleImport">导入</el-button>
                    <el-button :icon="Download" @click="handleExport">导出全部</el-button>
                    <el-button :icon="sidebarCollapsed ? Expand : Fold" :aria-expanded="!sidebarCollapsed" :title="sidebarCollapsed ? '显示概览' : '隐藏概览'" @click="toggleSidebar">{{ sidebarCollapsed ? '显示概览' : '隐藏概览' }}</el-button>
                </div>
            </div>
            <div class="workbench-grid">
                <section class="domain-ledger" aria-label="网站台账" :aria-busy="loading">
                    <div v-if="overviewError" class="overview-error" role="alert"><span>{{ overviewError }}</span><el-button size="small" @click="loadOverview">重试概览</el-button></div>
                    <div v-if="sourceLabel" class="ledger-viewbar">
                        <el-tag v-if="sourceLabel" closable @close="clearSource">{{ sourceLabel }}</el-tag>
                    </div>
                    <div v-if="detectProgress.total" class="detection-progress" role="status">已检测 {{ detectProgress.done }} / {{ detectProgress.total }} · 状态变化 {{ detectProgress.changed }} · 检测失败 {{ detectProgress.failed }}<span v-if="!detecting"> · {{ queue.pending.value.length ? '部分结果待同步' : '已同步' }}</span></div>
                    <div v-if="contextError" class="load-error" role="alert">{{ contextError }}</div>
                    <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><el-button @click="loadDomains">重试</el-button></div>
                    <el-table ref="tableRef" :data="filteredDomains" v-loading="loading" element-loading-text="正在加载域名…" class="custom-table" :row-class-name="tableRowClassName" @sort-change="handleTableSortChange">
                        <el-table-column prop="site_name" label="网站名称" min-width="170" :fixed="pinIdentityColumns" sortable><template #default="scope"><div class="site-name-cell"><el-tooltip v-if="hasRecentOperation(scope.row)" content="近 7 天有操作记录" placement="top"><el-icon class="site-recent-star" role="img" aria-label="近 7 天有操作记录"><StarFilled /></el-icon></el-tooltip><el-tooltip v-if="seoNeedsAttention(scope.row)" :content="seoState(scope.row).title" placement="top"><el-icon class="site-seo-alert" role="img" :aria-label="seoState(scope.row).title"><WarningFilled /></el-icon></el-tooltip><button type="button" class="table-inline-text" :title="scope.row.site_name || '未命名'" @click="openQuickField(scope.row, 'site_name')">{{ scope.row.site_name || '未命名' }}</button></div></template></el-table-column>
                        <el-table-column prop="domain" label="域名" min-width="200" :fixed="pinIdentityColumns" sortable><template #default="scope"><div class="domain-cell"><a :href="'https://' + scope.row.domain" target="_blank" rel="noopener noreferrer" class="domain-link" :title="scope.row.domain" :aria-label="`打开 ${scope.row.domain}`">{{ scope.row.domain }}</a><div class="seo-cell" :class="`seo-${seoState(scope.row).kind}`"><button v-if="seoState(scope.row).actionable" type="button" class="seo-check-button seo-icon-only" :title="seoState(scope.row).title" :aria-label="seoState(scope.row).title" @click.stop="handleSeoToday(scope.row)"><el-icon><Check /></el-icon></button><span v-else class="seo-locked seo-icon-only" :title="seoState(scope.row).title"><el-icon><Lock /></el-icon></span></div><el-button text class="domain-copy-button" :icon="DocumentCopy" :title="`复制 ${scope.row.domain}`" :aria-label="`复制 ${scope.row.domain}`" @click.stop="copyDomain(scope.row.domain)" /></div></template></el-table-column>
                        <el-table-column v-if="platformTab === 'all'" prop="platform" label="技术栈" min-width="90" sortable><template #default="scope">{{ platformText(scope.row) }}</template></el-table-column>
                        <el-table-column prop="ownership" label="网站归属" min-width="130"><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.ownership" :disabled="ownershipSaving.has(scope.row.id)" :aria-label="`${scope.row.domain} 网站归属`" @change="value => handleOwnershipChange(scope.row, value)"><el-option v-for="ownership in siteOwnerships" :key="ownership" :label="ownership" :value="ownership" /></el-select></template></el-table-column>
                        <el-table-column v-if="platformTab === 'WordPress'" label="文章数量" min-width="82"><template #default="scope"><el-input-number class="inline-count-input" size="small" :model-value="scope.row.wp_article_count ?? undefined" :min="0" :precision="0" :step="1" :controls="false" placeholder="未填" :aria-label="`${scope.row.domain} 文章数量`" @change="value => handleWordPressCount(scope.row, 'wp_article_count', value)" /></template></el-table-column>
                        <el-table-column v-if="platformTab === 'WordPress'" label="计算器数量" min-width="92"><template #default="scope"><el-input-number class="inline-count-input" size="small" :model-value="scope.row.wp_calculator_count ?? undefined" :min="0" :precision="0" :step="1" :controls="false" placeholder="未填" :aria-label="`${scope.row.domain} 计算器数量`" @change="value => handleWordPressCount(scope.row, 'wp_calculator_count', value)" /></template></el-table-column>
                        <el-table-column prop="industry" label="类型" min-width="90" sortable><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.industry || ''" placeholder="未分类" clearable @change="value => handleInlineSelect(scope.row, 'industry', value)"><el-option v-for="industry in industryOptions" :key="industry" :label="industry" :value="industry" /></el-select></template></el-table-column>
                        <el-table-column prop="daily_clicks" label="日点击" min-width="96" sortable :sort-method="compareDailyClicks"><template #default="scope"><el-select class="inline-select click-range-select" size="small" :model-value="scope.row.daily_clicks_range || clickRangeFromNumber(scope.row.daily_clicks) || ''" placeholder="未填写" clearable @change="value => handleDailyClicks(scope.row, value)"><el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" /></el-select></template></el-table-column>
                        <el-table-column prop="adsense_connected" label="AdSense" min-width="94" sortable><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.adsense_connected" @change="value => handleAdsenseSelect(scope.row, value)"><el-option label="未知" value="未知" /><el-option label="已开通" value="已开通" /><el-option label="未开通" value="未开通" /></el-select></template></el-table-column>
                        <el-table-column prop="adsense_income_usd" label="AdSense收入" min-width="118" sortable><template #default="scope"><span v-if="scope.row.adsense_income_detail_count">USD {{ Number(scope.row.adsense_income_usd || 0).toFixed(2) }}</span><span v-else class="page-muted">未细化</span></template></el-table-column>
                        <el-table-column label="服务商" min-width="180" show-overflow-tooltip><template #default="scope"><div class="provider-cell"><span :title="scope.row.resource_names || '未关联'">{{ scope.row.resource_names || '未关联' }}</span><el-select v-if="resourceOptions.length" class="provider-add-select" size="small" :model-value="undefined" placeholder="选择" :loading="resourceOptionsLoading" @change="value => handleResourceChange(scope.row, value)"><el-option v-for="resource in resourceOptions" :key="resource.value" :label="resourceOptionLabel(resource)" :value="resource.value" /></el-select><el-button v-else text size="small" @click="router.push({ name: 'Resources' })">先添加账号</el-button></div></template></el-table-column>
                        <el-table-column prop="expiry_date" label="到期日期" min-width="100" sortable><template #default="scope"><span :class="expiryState(scope.row).className">{{ scope.row.expiry_date || '未记录' }}</span></template></el-table-column>
                        <el-table-column label="电脑" min-width="155"><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.computer_name || ''" placeholder="选择 / 添加" filterable allow-create default-first-option clearable @change="value => handleComputerChange(scope.row, value)"><el-option v-for="computer in computerOptions" :key="computer" :label="computer" :value="computer" /></el-select></template></el-table-column>
                        <el-table-column label="操作" width="112"><template #default="scope"><div class="row-actions row-icon-actions"><el-button text :icon="Document" :title="`详情：${scope.row.domain}`" :aria-label="`详情：${scope.row.domain}`" @click="openDomainDetail(scope.row)" /><el-button text :icon="Edit" :title="`修改：${scope.row.domain}`" :aria-label="`修改：${scope.row.domain}`" @click="handleEdit(scope.row)" /><el-button text type="danger" :icon="Delete" :title="`删除：${scope.row.domain}`" :aria-label="`删除：${scope.row.domain}`" @click="handleDelete(scope.row)" /></div></template></el-table-column>
                        <template #empty><div class="empty-state" v-if="!loading && !loadError"><template v-if="domains.length"><p>没有匹配的网站</p><span>调整搜索或清除来源条件后再试。</span><button type="button" class="table-action" @click="clearResultsFilter">清除搜索与来源条件</button></template><template v-else><p>还没有域名</p><span>新增或导入域名后，会在此显示。</span><button type="button" class="table-action" @click="handleAdd">新增域名</button></template></div><div v-else class="empty-state"><span>{{ loading ? '正在加载域名…' : '域名列表未能加载，请重试。' }}</span></div></template>
                    </el-table>
                    <p class="table-scroll-hint">左右滑动查看全部字段和操作。</p>
                </section>

                <button v-if="!sidebarCollapsed" type="button" class="sidebar-backdrop" aria-label="关闭概览" @click="toggleSidebar"></button>
                <aside class="dashboard-sidebar" aria-label="管理概览">
                    <button type="button" class="overview-close" @click="toggleSidebar">关闭概览</button>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>AdSense 累计收入 · 全局</h2><button class="sidebar-link" @click="router.push({ name: 'Adsense' })">管理</button></div><div v-if="dashboard.owner_income.length" class="sidebar-list"><div v-for="item in dashboard.owner_income" :key="item.owner" class="sidebar-row"><span>{{ item.owner }}<small>{{ item.account_count }} 个账号 · {{ item.site_count }} 个网站 · 累计</small></span><strong>USD {{ Number(item.income_usd_total || 0).toFixed(2) }}<em v-if="item.income_cny_total != null"> · CNY {{ Number(item.income_cny_total).toFixed(2) }}</em></strong></div></div><p v-else class="sidebar-empty">暂无收入记录</p></section>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>最久未 SEO · {{ summaryScope }}</h2></div><div v-if="dashboard.seo.length" class="sidebar-list"><div v-for="item in dashboard.seo" :key="item.id" class="sidebar-row"><span>{{ item.domain }}<small>{{ item.seo_last_date || '从未优化' }} · {{ item.days_since ?? '—' }} 天</small></span><button v-if="seoState(item).actionable" class="sidebar-link" @click="markSeoById(item.id)">今天优化</button><span v-else class="sidebar-seo-locked" :title="seoState(item).title"><el-icon><Lock /></el-icon></span></div></div><p v-else class="sidebar-empty">暂无网站</p></section>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>日点击分布 · {{ summaryScope }}</h2></div><div class="click-summary"><span>未填写 <strong>{{ dashboard.clicks.unknown || 0 }}</strong></span><span>&lt;10 <strong>{{ dashboard.clicks.under_10 || 0 }}</strong></span><span>10–29 <strong>{{ dashboard.clicks.from_10_to_29 || 0 }}</strong></span><span>30–49 <strong>{{ dashboard.clicks.from_30_to_49 || 0 }}</strong></span><span>50–99 <strong>{{ dashboard.clicks.from_50_to_99 || 0 }}</strong></span><span>≥100 <strong>{{ dashboard.clicks.over_100 || 0 }}</strong></span></div></section>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>基础设施 · 全局</h2><button class="sidebar-link" @click="router.push({ name: 'Resources' })">管理</button></div><div class="provider-summary"><div v-for="item in dashboard.providers" :key="item.provider"><span>{{ providerLabel(item.provider) }}</span><strong>{{ item.account_count }} 账号 · {{ item.resource_count }} 资源 · {{ item.linked_domain_count }} 网站 · 全局</strong></div></div></section>
                </aside>
            </div>
        </main>

        <DomainDialog v-model:visible="dialogVisible" :saving="domainSaving" :is-edit="isEdit" :edit-data="editData" :accounts="adsenseAccounts" @submit="handleDialogSubmit" />
        <DomainDetailDrawer v-model:visible="detailVisible" :domain="detailDomain" @changed="refreshDomainDetails" @edit="handleDetailEdit" />
        <QuickFieldDialog v-model:visible="quickFieldVisible" :saving="quickFieldSaving" :title="quickFieldTitle" :context="quickFieldDomain?.domain" :label="quickFieldLabel" :value="quickFieldValue" :placeholder="quickFieldPlaceholder" :maxlength="quickFieldMode === 'platform_other' ? 100 : 200" @save="saveQuickField" />
        <AdsenseQuickDialog v-model:visible="adsenseQuickVisible" :saving="adsenseSaving" :domain="adsenseQuickDomain?.domain" :accounts="adsenseAccounts" :account-id="adsenseQuickDomain?.adsense_account_id" :opened-date="adsenseQuickDomain?.adsense_opened_date" :registrar-date="adsenseQuickDomain?.registrar_date" @save="saveAdsenseQuick" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, watch } from 'vue';
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
import { ElMessage, type TableInstance } from 'element-plus';
import { Refresh, Plus, Upload, Download, Search, Fold, Expand, Check, Lock, StarFilled, WarningFilled, Document, DocumentCopy, Edit, Delete } from '@element-plus/icons-vue';
import '../styles/home/home.css';
import { useAuth } from '../utils/auth';
import DomainDialog from '../components/DomainDialog.vue';
import DomainDetailDrawer from '../components/DomainDetailDrawer.vue';
import QuickFieldDialog from '../components/QuickFieldDialog.vue';
import AdsenseQuickDialog from '../components/AdsenseQuickDialog.vue';
import { cachedGet, cachedValue, invalidateData, queryText } from '../utils/workspaceCache';
import { downloadExcel } from '../utils/downloads';
import { createDomain, updateDomain, deleteDomain, type DomainData } from '../api/domains';
import { getWriteQueue } from '../utils/writeQueue';
import { api, ApiError } from '../utils/request';
import { confirmAction, isDismissed } from '../utils/feedback';
import { copyText } from '../utils/clipboard';
import { siteOwnerships, isSiteOwnership, type SiteOwnership } from '../../shared/website-classification';

interface DomainSortState { prop: string; order: 'ascending' | 'descending'; }

const defaultTableSort: DomainSortState = { prop: 'expiry_date', order: 'ascending' };
const tableSortStorageKey = 'domain-manager.table-sort';
const sortableTableProps = new Set(['site_name', 'domain', 'industry', 'daily_clicks', 'platform', 'adsense_connected', 'adsense_income_usd', 'expiry_date']);
const readTableSort = (): DomainSortState => {
    try {
        const raw = window.localStorage.getItem(tableSortStorageKey);
        if (!raw) return { ...defaultTableSort };
        const parsed = JSON.parse(raw) as Partial<DomainSortState>;
        if (typeof parsed.prop === 'string' && sortableTableProps.has(parsed.prop) && (parsed.order === 'ascending' || parsed.order === 'descending')) {
            return { prop: parsed.prop, order: parsed.order };
        }
    } catch { /* corrupted localStorage should not prevent the page from loading */ }
    return { ...defaultTableSort };
};

const router = useRouter();
const route = useRoute();
const auth = useAuth();
const domains = cachedValue<DomainData[]>('/api/domains');
if (!domains.value) domains.value = [];
// Presentation only: pinned columns would cover all actions on narrow screens.
const tableMedia = window.matchMedia('(min-width: 761px)');
const pinIdentityColumns = ref(tableMedia.matches);
const updatePinnedColumns = () => { pinIdentityColumns.value = tableMedia.matches; };
onMounted(() => tableMedia.addEventListener('change', updatePinnedColumns));
onUnmounted(() => tableMedia.removeEventListener('change', updatePinnedColumns));
const tableRef = ref<TableInstance>();
const tableSort = ref<DomainSortState>(sortableTableProps.has(queryText(route.query.sort)) && ['ascending', 'descending'].includes(queryText(route.query.order)) ? { prop: queryText(route.query.sort), order: queryText(route.query.order) as DomainSortState['order'] } : readTableSort());
const applyingTableSort = ref(false);
const adsenseAccounts = ref<Array<{ id?: number; name: string; owner: string; publisher_id?: string | null; currency: string; status: string; memo: string; linked_domains?: number }>>([]);
const queue = getWriteQueue();
const searchText = ref(queryText(route.query.q));
const platformTab = computed(() => ['Astro', 'Next.js', 'WordPress'].includes(queryText(route.query.platform)) ? queryText(route.query.platform) : 'all');
const ownershipTab = computed(() => isSiteOwnership(queryText(route.query.ownership)) ? queryText(route.query.ownership) : 'all');
const summaryScope = computed(() => `${ownershipTab.value === 'all' ? '全部归属' : ownershipTab.value} · ${platformTab.value === 'all' ? '全部技术栈' : platformTab.value}`);
const computerOptions = ref<string[]>(['Mac Mini Luokun', 'Mac Mini YC', 'Mac MiniBook 旧']);
const computerStorageKey = 'domain-manager.computers';
try { const savedComputers = JSON.parse(localStorage.getItem(computerStorageKey) || '[]'); if (Array.isArray(savedComputers)) computerOptions.value = [...new Set([...computerOptions.value, ...savedComputers.filter(value => typeof value === 'string')])]; } catch { /* keep defaults */ }
const sidebarCollapsed = ref(true);
const loading = ref(false);
const loadError = ref('');
const overviewError = ref('');
const refreshing = ref(false);
const detecting = ref(false);
const detectProgress = ref({ total: 0, done: 0, changed: 0, failed: 0 });
const domainSaving = ref(false);
const ownershipSaving = ref(new Set<number>());
const quickFieldSaving = ref(false);
const adsenseSaving = ref(false);
interface ResourceOption { value: string; kind: 'resource' | 'account'; id: number; provider: string; name: string; account_id?: number; account_name?: string | null; identifier?: string | null; status?: string }
const resourceOptions = ref<ResourceOption[]>([]);
const resourceOptionsLoading = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const editData = ref<DomainData>();
const detailVisible = computed({ get: () => route.name === 'Home' && Boolean(route.query.site) && Boolean(detailDomain.value), set: value => { if (!value && route.query.site) { const query = { ...route.query }; delete query.site; void router.push({ query }) } } });
const detailDomain = ref<DomainData>();
const quickFieldVisible = ref(false);
const quickFieldMode = ref<'site_name' | 'platform_other'>('site_name');
const quickFieldDomain = ref<DomainData>();
const quickFieldTitle = computed(() => quickFieldMode.value === 'site_name' ? '编辑网站名称' : '填写其他技术栈');
const quickFieldLabel = computed(() => quickFieldMode.value === 'site_name' ? '网站名称' : '技术栈名称');
const quickFieldPlaceholder = computed(() => quickFieldMode.value === 'site_name' ? '例如：电气计算器站' : '例如：Nuxt、静态 HTML');
const quickFieldValue = computed(() => quickFieldMode.value === 'site_name' ? quickFieldDomain.value?.site_name : quickFieldDomain.value?.platform_other);
const adsenseQuickVisible = ref(false);
const adsenseQuickDomain = ref<DomainData>();
interface HomeOverviewTotals { expiring_domains: number; excellent_wordpress: number; excellent_astro: number; excellent_nextjs: number }
interface DashboardData { totals: Record<string, number>; seo: Array<{ id: number; domain: string; seo_last_date: string | null; days_since: number | null }>; clicks: Record<string, number>; providers: Array<{ provider: string; account_count: number; resource_count: number; linked_domain_count: number }>; owner_income: Array<{ owner: string; currency: string; account_count: number; site_count: number; income_usd_total: number; income_cny_total: number | null; opened_date: string | null }>; platforms: Array<{ platform: string; count: number }>; quality: Record<string, number> }
const emptyDashboard = (): DashboardData => ({ totals: {}, seo: [], clicks: {}, providers: [], owner_income: [], platforms: [], quality: {} });
const dashboard = ref<DashboardData>(emptyDashboard());
const homeOverviewTotals = inject<{ value: HomeOverviewTotals | null }>('homeOverviewTotals');
const dashboardLoading = ref(false);
let dashboardRequest = 0;
const industryOptions = ['计算器', '资讯站', '其他'];
const normalizeIndustry = (value: string | null | undefined) => value && industryOptions.includes(value) ? value : value ? '其他' : null;
const sourceLinks = ref<Array<{ domain_id: number; resource_id: number; account_id?: number; resource_name?: string; account_name?: string }>>([]);
const sourceLabel = computed(() => {
    if (route.query.adsense_account) return `AdSense：${adsenseAccounts.value.find(account => String(account.id) === route.query.adsense_account)?.name || route.query.adsense_account}`;
    if (route.query.resource) return `资源：${sourceLinks.value.find(link => String(link.resource_id) === route.query.resource)?.resource_name || route.query.resource}`;
    if (route.query.provider_account) return `资源账号：${sourceLinks.value.find(link => String(link.account_id) === route.query.provider_account)?.account_name || route.query.provider_account}`;
    return '';
});
const clearResultsFilter = () => { searchText.value = ''; const query = { ...route.query }; delete query.q; delete query.adsense_account; delete query.resource; delete query.provider_account; void router.replace({ query }); };
const clearSource = () => { const query = { ...route.query }; delete query.adsense_account; delete query.resource; delete query.provider_account; void router.push({ query }); };
const contextError = ref('');
const filteredDomains = computed(() => domains.value.filter(row => {
    const haystack = `${row.domain} ${row.site_name || ''} ${normalizeIndustry(row.industry) || ''} ${row.registrar} ${row.memo} ${row.computer_name || ''} ${row.resource_names || ''} ${row.platform}`.toLowerCase();
    if (searchText.value && !haystack.includes(searchText.value.trim().toLowerCase())) return false;
    if (platformTab.value !== 'all' && row.platform !== platformTab.value) return false;
    if (ownershipTab.value !== 'all' && row.ownership !== ownershipTab.value) return false;
    if (route.query.adsense_account && String(row.adsense_account_id) !== route.query.adsense_account) return false;
    if (route.query.resource && !sourceLinks.value.some(link => link.domain_id === row.id && String(link.resource_id) === route.query.resource)) return false;
    if (route.query.provider_account && !sourceLinks.value.some(link => link.domain_id === row.id && String(link.account_id) === route.query.provider_account)) return false;
    return true;
}));

const checkLoginStatus = () => { if (!auth.getAuthToken()) router.push({ name: 'Login' }); };
const handleAdd = () => { isEdit.value = false; editData.value = undefined; dialogVisible.value = true; };
const handleEdit = (row: DomainData) => { isEdit.value = true; editData.value = row; dialogVisible.value = true; };
const openDomainDetail = (row: DomainData) => { detailDomain.value = row; void router.push({ query: { ...route.query, site: row.domain } }); };
const handleDetailEdit = (row: DomainData) => { detailVisible.value = false; handleEdit(row); };

const handleImport = () => { void router.push({ name: 'Data' }); };
const handleComputerChange = async (row: DomainData, value: string | null) => { const name = value?.trim() || ''; if (!row.id || row.computer_name === name) return; const previous = row.computer_name; row.computer_name = name || null; if (name && !computerOptions.value.includes(name)) { computerOptions.value.push(name); localStorage.setItem(computerStorageKey, JSON.stringify(computerOptions.value)); } try { await api.patch(`/api/domains/${row.id}`, { computer_name: name || null }); } catch (error) { row.computer_name = previous || null; ElMessage.error(error instanceof Error ? error.message : '电脑信息保存失败'); } };
const resourceOptionLabel = (resource: ResourceOption) => `${providerLabel(resource.provider)} · ${resource.account_name ? `${resource.account_name} / ` : ''}${resource.name}`;
const resourceRole = (provider: string) => ({ github: '代码仓库', cloudflare: '部署平台', vhost: '虚拟主机', vps: 'VPS' }[provider] || '其他');
const handleResourceChange = async (row: DomainData, value: string | undefined) => {
    if (!row.id || !value) return;
    const resource = resourceOptions.value.find(item => item.value === value);
    if (!resource) return;
    try {
        await api.post('/api/resources/links', resource.kind === 'account' ? { domain_id: row.id, account_id: resource.account_id, role: '账号归属', is_primary: !row.resource_count } : { domain_id: row.id, resource_id: resource.id, role: resourceRole(resource.provider), is_primary: !row.resource_count });
        invalidateData('/api/domains', '/api/resources', '/api/resources/links', '/api/dashboard/summary');
        await loadDomains();
        ElMessage.success(`已关联资源：${resourceOptionLabel(resource)}`);
    } catch (error) { ElMessage.error(error instanceof Error ? error.message : '资源关联失败'); }
};
const loadResourceOptions = async (force = false) => {
    resourceOptionsLoading.value = true;
    try {
        const [resources, accounts] = await Promise.all([cachedGet<ResourceOption[]>('/api/resources', force), cachedGet<Array<{ id: number; provider: string; name: string; login_email?: string | null; status?: string }>>('/api/resources/accounts', force)]);
        const actualResources = resources.filter(resource => resource.status !== '停用' && !resource.identifier?.startsWith('account:')).map(resource => ({ ...resource, value: `resource:${resource.id}`, kind: 'resource' as const }));
        const accountOptions = accounts.filter(account => account.status !== '停用').map(account => ({ value: `account:${account.id}`, kind: 'account' as const, id: account.id, account_id: account.id, provider: account.provider, name: '账号归属', account_name: account.name, status: account.status }));
        resourceOptions.value = [...actualResources, ...accountOptions];
    } catch { resourceOptions.value = []; }
    finally { resourceOptionsLoading.value = false; }
};
const saveTableSort = (sort: DomainSortState) => { tableSort.value = { ...sort }; window.localStorage.setItem(tableSortStorageKey, JSON.stringify(tableSort.value)); void router.replace({ query: { ...route.query, sort: sort.prop, order: sort.order } }); };
const applyTableSort = async () => { await nextTick(); if (!tableRef.value) return; applyingTableSort.value = true; tableRef.value.sort(tableSort.value.prop, tableSort.value.order); applyingTableSort.value = false; };
const handleTableSortChange = ({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }) => {
    if (applyingTableSort.value) return;
    if (!prop || !sortableTableProps.has(prop) || !order) {
        saveTableSort({ ...defaultTableSort });
        void applyTableSort();
    } else saveTableSort({ prop, order });
};
const daysSince = (date: string) => { const [y,m,d] = date.split('-').map(Number); const today = localDate().split('-').map(Number); return Math.max(0, Math.floor((Date.UTC(today[0], today[1] - 1, today[2]) - Date.UTC(y, m - 1, d)) / 86400000)); };
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const toggleSidebar = () => { sidebarCollapsed.value = !sidebarCollapsed.value; };
const seoState = (row: Pick<DomainData, 'seo_last_date'> & { domain?: string }) => {
    if (!row.seo_last_date) return { kind: 'never', actionable: true, label: '未优化', title: `${'domain' in row ? row.domain + '：' : ''}从未优化，点击记录今天` };
    const days = daysSince(row.seo_last_date);
    if (days <= 15) return { kind: 'recent', actionable: false, label: `${days} 天前`, title: `${row.domain || '网站'} · ${row.seo_last_date}：最近 ${days} 天前优化，第 15 天内不可重复操作` };
    if (days <= 30) return { kind: 'stale', actionable: true, label: `${days} 天前`, title: `${row.domain || '网站'} · ${row.seo_last_date}：最近 ${days} 天前优化，可以再次安排` };
    return { kind: 'overdue', actionable: true, label: `${days} 天前`, title: `${row.domain || '网站'} · ${row.seo_last_date}：已经 ${days} 天未优化，建议优先处理` };
};
const seoNeedsAttention = (row: Pick<DomainData, 'seo_last_date'> | { seo_last_date: string | null }) => ['never', 'overdue'].includes(seoState(row).kind);
const hasRecentOperation = (row: Pick<DomainData, 'latest_operation_date'>) => Boolean(row.latest_operation_date && row.latest_operation_date <= localDate() && daysSince(row.latest_operation_date) <= 7);
const expiryState = (row: Pick<DomainData, 'expiry_date'>) => {
    if (!row.expiry_date) return { kind: 'unknown', className: 'expiry-unknown', days: null as number | null };
    const [y, m, d] = row.expiry_date.split('-').map(Number);
    const todayParts = localDate().split('-').map(Number);
    const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2])) / 86400000);
    if (days < 0) return { kind: 'expired', className: 'expiry-expired', days };
    if (days <= 30) return { kind: 'expiring', className: 'expiry-expiring', days };
    return { kind: 'normal', className: 'expiry-normal', days };
};
const tableRowClassName = ({ row }: { row: DomainData }) => {
    const classes: string[] = [];
    const expiry = expiryState(row);
    if (expiry.kind === 'expired') classes.push('row-expired');
    else if (expiry.kind === 'expiring') classes.push('row-expiring');
    else if (hasRecentOperation(row)) classes.push('row-recent-operation');
    else if (seoNeedsAttention(row)) classes.push('row-seo-attention');
    return classes.join(' ');
};
const clickRangeFromNumber = (value: number | null | undefined) => value == null ? null : value < 10 ? 'under10' : value < 30 ? '10to29' : value < 50 ? '30to49' : value < 100 ? '50to99' : 'over100';
const clickRangeRank = (row: DomainData) => ({ under10: 1, '10to29': 2, '30to49': 3, '50to99': 4, over100: 5 } as Record<string, number>)[row.daily_clicks_range || clickRangeFromNumber(row.daily_clicks) || ''] || 0;
const compareDailyClicks = (a: DomainData, b: DomainData) => clickRangeRank(a) - clickRangeRank(b);
const copyDomain = async (domain: string) => { try { await copyText(domain); ElMessage.success(`已复制域名：${domain}`); } catch { ElMessage.error('复制失败，请手动复制'); } };
const reportQueued = (message: string, pending: boolean) => pending ? ElMessage.warning('修改已保存在本机，尚未同步；请查看同步状态') : ElMessage.success(message);
const handleSeoToday = async (row: DomainData) => {
    if (!row.id || !seoState(row).actionable) return;
    const date = localDate();
    try {
        queue.enqueueMany([{ type: 'domain_patch', id: row.id, fields: { seo_last_date: date } }, { type: 'domain_operation_add', domain_id: row.id, operation_date: date, operation_kind: 'SEO' }]);
        row.seo_last_date = date; row.latest_operation_date = date;
        await queue.flush();
        reportQueued('已记录今天的 SEO 优化', queue.pending.value.some(item => item.operation.id === row.id || item.operation.domain_id === row.id));
        await loadDashboard(); await applyTableSort();
    } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'SEO 操作未能加入队列'); }
};
const handleDailyClicks = async (row: DomainData, value: string | null) => {
    if (!row.id) return;
    const range = value || null;
    if ((row.daily_clicks_range || clickRangeFromNumber(row.daily_clicks)) === range) return;
    try {
        const fields = { daily_clicks: null, daily_clicks_range: range, clicks_updated_date: range ? localDate() : null };
        queue.enqueue({ type: 'domain_patch', id: row.id, fields }); Object.assign(row, fields);
        await queue.flush(); reportQueued('日点击区间已保存', queue.pending.value.some(item => item.operation.id === row.id));
        await loadDashboard(); await applyTableSort();
    } catch (error) { ElMessage.error(error instanceof Error ? error.message : '修改未能加入队列'); }
};
const markSeoById = (id: number) => { const row = domains.value.find(item => item.id === id); if (row) void handleSeoToday(row); };
const providerLabel = (value: string) => ({ github: 'GitHub', cloudflare: 'Cloudflare', vhost: '虚拟主机', vps: 'VPS' }[value] || value);
const platformText = (row: DomainData) => row.platform === '其他' ? (row.platform_other || '其他') : row.platform;
const handleInlineSelect = async (row: DomainData, field: 'status' | 'platform' | 'industry', value: string | null) => {
    if (!row.id) return;
    if (row[field] === value) return;
    const snapshot = { ...row };
    const fields: Record<string, unknown> = { [field]: value || null };
    if (field === 'platform' && value !== '其他') fields.platform_other = null;
    if (field === 'platform' && value !== 'WordPress') {
        fields.wp_calculator_count = null;
        fields.wp_article_count = null;
        fields.content_stats_updated_date = null;
    }
    Object.assign(row, fields);
    try {
        await api.patch(`/api/domains/${row.id}`, fields);
        invalidateData('/api/dashboard/summary');
        if (field === 'platform' && value === '其他') openQuickField(row, 'platform_other');
        await applyTableSort();
    } catch (error) {
        Object.assign(row, snapshot);
        ElMessage.error(error instanceof Error ? error.message : '保存失败');
    }
};
const handleOwnershipChange = async (row: DomainData, value: SiteOwnership) => {
    if (!row.id || ownershipSaving.value.has(row.id) || row.ownership === value) return;
    ownershipSaving.value.add(row.id);
    const previous = row.ownership;
    row.ownership = value;
    try {
        await api.patch(`/api/domains/${row.id}`, { ownership: value });
        invalidateData('/api/dashboard/summary');
        await loadOverview();
        if (ownershipTab.value !== 'all' && ownershipTab.value !== value) ElMessage.success('已保存，该网站不在当前筛选范围内');
    } catch (error) {
        row.ownership = previous;
        ElMessage.error(error instanceof Error ? error.message : '网站归属保存失败');
    } finally { ownershipSaving.value.delete(row.id); }
};
const handleWordPressCount = async (row: DomainData, field: 'wp_calculator_count' | 'wp_article_count', value: number | undefined | null) => {
    if (!row.id || row.platform !== 'WordPress') return;
    const nextValue = value == null ? null : value;
    if (row[field] === nextValue) return;
    const previousValue = row[field];
    const previousDate = row.content_stats_updated_date;
    const nextDate = (field === 'wp_calculator_count' ? nextValue : row.wp_calculator_count) == null && (field === 'wp_article_count' ? nextValue : row.wp_article_count) == null ? null : localDate();
    row[field] = nextValue;
    row.content_stats_updated_date = nextDate;
    try {
        await api.patch(`/api/domains/${row.id}`, { [field]: nextValue, content_stats_updated_date: nextDate });
        ElMessage.success('内容数量已更新');
    } catch (error) {
        row[field] = previousValue;
        row.content_stats_updated_date = previousDate;
        ElMessage.error(error instanceof Error ? error.message : '内容数量保存失败');
    }
};
const handleAdsenseSelect = (row: DomainData, value: '未知' | '已开通' | '未开通') => {
    if (!row.id || value === row.adsense_connected) return;
    if (value === '已开通') {
        adsenseQuickDomain.value = row;
        adsenseQuickVisible.value = true;
        return;
    }
    void saveAdsenseStatus(row, value);
};
const saveAdsenseStatus = async (row: DomainData, status: '未知' | '已开通' | '未开通', extra: { adsense_account_id?: number | null; adsense_opened_date?: string | null } = {}) => {
    if (!row.id || adsenseSaving.value) return;
    adsenseSaving.value = true;
    const previous = { adsense_connected: row.adsense_connected, adsense_account_id: row.adsense_account_id, adsense_opened_date: row.adsense_opened_date };
    row.adsense_connected = status;
    if (extra.adsense_account_id !== undefined) row.adsense_account_id = extra.adsense_account_id;
    if (extra.adsense_opened_date !== undefined) row.adsense_opened_date = extra.adsense_opened_date;
    try {
        const updated = await api.patch<DomainData>(`/api/domains/${row.id}`, { adsense_connected: status, ...extra });
        Object.assign(row, updated);
        invalidateData('/api/adsense/accounts', '/api/dashboard/summary');
        adsenseQuickVisible.value = false;
        await applyTableSort();
    } catch (error) {
        Object.assign(row, previous);
        ElMessage.error(error instanceof Error ? error.message : 'AdSense 状态保存失败');
    } finally { adsenseSaving.value = false; }
};
const saveAdsenseQuick = async (value: { adsense_account_id: number; adsense_opened_date: string }) => {
    const row = adsenseQuickDomain.value;
    if (row) await saveAdsenseStatus(row, '已开通', value);
};
const openQuickField = (row: DomainData, mode: 'site_name' | 'platform_other') => { quickFieldDomain.value = row; quickFieldMode.value = mode; quickFieldVisible.value = true; };
const saveQuickField = async (value: string | null) => {
    const row = quickFieldDomain.value; if (!row?.id || quickFieldSaving.value) return; quickFieldSaving.value = true;
    const field = quickFieldMode.value; const oldValue = row[field]; row[field] = value as never;
    try { await api.patch(`/api/domains/${row.id}`, { [field]: value }); quickFieldVisible.value = false; await applyTableSort(); }
    catch (error) { row[field] = oldValue as never; ElMessage.error(error instanceof Error ? error.message : '保存失败'); } finally { quickFieldSaving.value = false; }
};
const loadAdsenseAccounts = async () => { try { adsenseAccounts.value = await cachedGet(`/api/adsense/accounts?month=${localDate().slice(0, 7)}`); return true; } catch(error) { console.error('获取 AdSense 账号失败:', error); return false; } };
const loadDashboard = async () => {
    const request = ++dashboardRequest;
    dashboardLoading.value = true;
    dashboard.value = emptyDashboard();
    if (homeOverviewTotals) homeOverviewTotals.value = null;
    try {
        const today = localDate();
        const params = new URLSearchParams({ today, month: today.slice(0, 7), ownership: ownershipTab.value, platform: platformTab.value });
        const data = await cachedGet<DashboardData>(`/api/dashboard/summary?${params}`);
        if (request === dashboardRequest) {
            dashboard.value = data;
            if (homeOverviewTotals) homeOverviewTotals.value = {
                expiring_domains: data.totals.expiring_domains || 0,
                excellent_wordpress: data.totals.excellent_wordpress || 0,
                excellent_astro: data.totals.excellent_astro || 0,
                excellent_nextjs: data.totals.excellent_nextjs || 0
            };
        }
        return true;
    } catch (error) {
        if (request === dashboardRequest) overviewError.value = '概览数据未能完整加载，列表数据仍可继续使用。';
        console.error('获取首页概览失败:', error); return false;
    } finally { if (request === dashboardRequest) dashboardLoading.value = false; }
};
let overviewRequest = 0;
const loadOverview = async () => {
    const request = ++overviewRequest;
    overviewError.value = '';
    const results = await Promise.all([loadAdsenseAccounts(), loadDashboard()]);
    if (request === overviewRequest && results.some(result => !result)) overviewError.value = '概览数据未能完整加载，列表数据仍可继续使用。';
};
const reloadAll = async () => { invalidateData('/api/domains', '/api/dashboard/summary', '/api/adsense/accounts'); await Promise.all([loadDomains(), loadOverview()]); };
const refreshDomainDetails = async () => { invalidateData('/api/domains', '/api/dashboard/summary'); await loadDomains(); await loadDashboard(); };

const handleDelete = async (row: DomainData) => {
    try {
        await confirmAction(`删除后将移除“${row.domain}”及其关联记录，是否继续？`, `删除域名 · ${row.domain}`, { confirmButtonText: '删除' });
        if (row.id) {
            await deleteDomain(row.id);
            await reloadAll();
        }
    } catch (error) { if (!isDismissed(error)) ElMessage.error('删除失败'); }
};

const handleDialogSubmit = async (formData: Omit<DomainData, 'id' | 'created_at'>) => {
    if (domainSaving.value) return; domainSaving.value = true;
    try {
        const savedDomain = formData.domain.trim().toLowerCase().replace(/\.$/, '');
        if (isEdit.value && editData.value?.id) {
            await updateDomain(editData.value.id, formData);
        } else {
            await createDomain(formData);
        }
        dialogVisible.value = false;
        invalidateData('/api/domains', '/api/adsense/accounts', '/api/dashboard/summary');
        await loadDomains();
        await loadOverview();
        const savedRow = domains.value.find(row => row.domain === savedDomain);
        if (savedRow && ((ownershipTab.value !== 'all' && savedRow.ownership !== ownershipTab.value) || (platformTab.value !== 'all' && savedRow.platform !== platformTab.value))) ElMessage.success('已保存，该网站不在当前筛选范围内');
    } catch (error: unknown) { ElMessage.error(error instanceof Error ? error.message : '操作失败'); } finally { domainSaving.value = false; }
};

const loadDomains = async () => {
    loading.value = true;
    loadError.value = '';
    try {
        const rows = await cachedGet<DomainData[]>('/api/domains');
        rows.forEach(row => { row.industry = normalizeIndustry(row.industry); });
        domains.value = queue.applyPendingDomains(rows);
        computerOptions.value = [...new Set([...computerOptions.value, ...domains.value.map(row => row.computer_name).filter((value): value is string => Boolean(value))])];
        if (route.query.site) detailDomain.value = domains.value.find(row => row.domain === route.query.site);
        await applyTableSort();
    } catch (error: any) {
        loadError.value = error.message || '加载域名列表失败，请重试。';
        if (error instanceof ApiError && error.status === 401) { auth.clearAuth(); router.push({ name: 'Login' }); }
    } finally {
        loading.value = false;
    }
};

watch(filteredDomains, () => { void applyTableSort(); });
watch([ownershipTab, platformTab], () => { if (route.name === 'Home') void loadOverview(); });

const handleRefresh = async () => {
    if (refreshing.value) return;
    const scroll = window.scrollY; refreshing.value = true;
    try { await reloadAll(); await loadResourceOptions(true); await nextTick(); window.scrollTo(0, scroll); }
    finally { refreshing.value = false; }
};
const handleDetect = async () => {
    if (detecting.value) return;
    const targets = filteredDomains.value.map(row => ({ id: row.id, domain: row.domain }));
    detecting.value = true; detectProgress.value = { total: targets.length, done: 0, changed: 0, failed: 0 };
    try {
        for (let index = 0; index < targets.length; index += 4) {
            await Promise.all(targets.slice(index, index + 4).map(async target => {
                try {
                    const result = await api.post<{ status: string }>('/api/domains/check', { domain: target.domain });
                    if (!['在线', '离线'].includes(result.status)) throw new Error('状态检查结果无效');
                    const row = domains.value.find(item => item.id === target.id);
                    if (row && target.id) {
                        const checkedDate = localDate();
                        if (row.status !== result.status || row.last_status_check_at?.slice(0,10) !== checkedDate) {
                            queue.enqueue({ type: 'domain_patch', id: target.id, fields: { status: result.status, last_status_check_at: checkedDate } });
                            if (row.status !== result.status) detectProgress.value.changed++;
                            row.status = result.status; row.last_status_check_at = checkedDate;
                        }
                    }
                } catch { detectProgress.value.failed++; }
                finally { detectProgress.value.done++; }
            }));
            if (queue.pending.value.length >= 175) await queue.flush();
        }
        const result = await queue.flush();
        if (result.pending) ElMessage.warning('检测已完成，部分修改仍待同步');
        else if (detectProgress.value.failed) ElMessage.warning(`检测完成，${detectProgress.value.failed} 个网站检测失败，原状态保留`);
        else ElMessage.success('当前结果检测完成并已同步');
        await loadDashboard();
    } finally { detecting.value = false; }
};
const handleExport = async () => { try { await downloadExcel(); ElMessage.success('导出成功'); } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败'); } };
const restoreContext = async () => {
    contextError.value = '';
    try {
        if (route.query.resource || route.query.provider_account) sourceLinks.value = await cachedGet('/api/resources/links');
        if (route.query.site) {
            detailDomain.value = domains.value.find((row: DomainData) => row.domain === route.query.site);
            if (!detailDomain.value) contextError.value = '该域名不存在，无法打开详情。';
        }
        if (route.query.adsense_account && !adsenseAccounts.value.some(account => String(account.id) === route.query.adsense_account)) contextError.value = '指定的 AdSense 账号不存在。';
        if (route.query.resource || route.query.provider_account) {
            const endpoint = route.query.resource ? '/api/resources' : '/api/resources/accounts';
            const items = await cachedGet<Array<{ id: number }>>(endpoint);
            if (!items.some(item => String(item.id) === String(route.query.resource || route.query.provider_account))) contextError.value = '指定的资源或账号不存在。';
        }
    } catch (error) { contextError.value = error instanceof Error ? error.message : '关联数据加载失败'; }
};
watch(() => route.query, () => { if (route.name === 'Home') { searchText.value = queryText(route.query.q); if (sortableTableProps.has(queryText(route.query.sort)) && ['ascending','descending'].includes(queryText(route.query.order))) { tableSort.value = { prop: queryText(route.query.sort), order: queryText(route.query.order) as DomainSortState['order'] }; void applyTableSort(); } void restoreContext(); } });
watch(searchText, value => { if (route.name === 'Home' && value !== queryText(route.query.q)) { const query = { ...route.query }; if (value) query.q = value; else delete query.q; void router.replace({ query }); } });
let savedScroll = 0;
onBeforeRouteLeave(() => { savedScroll = window.scrollY; });
onDeactivated(() => { /* KeepAlive preserves the list, search and horizontal table position. */ });
onActivated(async () => { await loadDomains(); await loadOverview(); await restoreContext(); await nextTick(); window.scrollTo(0, savedScroll); });
onMounted(() => {
    checkLoginStatus();
    void loadDomains();
    void loadResourceOptions();
    void loadOverview();
    void queue.flush();
});
</script>
