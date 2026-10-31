<template>
    <div class="home-container" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
        <main class="workspace">
            <section class="summary-grid" aria-label="运营指标">
                <button type="button" class="summary-card" :class="{ 'summary-card-active': activeSummaryPreset === 'all' }" @click="applySummaryFilter('all')"><span>域名总数</span><strong>{{ dashboard.totals.total_domains || domains.length }}</strong></button>
                <button type="button" class="summary-card" :class="{ 'summary-card-active': activeSummaryPreset === 'expiring' }" @click="applySummaryFilter('expiring')"><span>30 天内到期</span><strong>{{ dashboard.totals.expiring_domains || 0 }}</strong></button>
                <button type="button" class="summary-card" :class="{ 'summary-card-active': activeSummaryPreset === 'seo-stale' }" @click="applySummaryFilter('seo-stale')"><span>30 天未优化</span><strong>{{ dashboard.totals.seo_stale_domains || 0 }}</strong></button>
                <button type="button" class="summary-card" :class="{ 'summary-card-active': activeSummaryPreset === 'wordpress-excellent' }" @click="applySummaryFilter('wordpress-excellent')"><span>WP 优秀网站</span><strong>{{ dashboard.totals.excellent_wordpress || 0 }}</strong><small>WordPress · 日点击 ≥30</small></button>
                <button type="button" class="summary-card" :class="{ 'summary-card-active': activeSummaryPreset === 'astro-excellent' }" @click="applySummaryFilter('astro-excellent')"><span>Astro 优秀网站</span><strong>{{ dashboard.totals.excellent_astro || 0 }}</strong><small>Astro · 日点击 ≥30</small></button>
                <button type="button" class="summary-card" :class="{ 'summary-card-active': activeSummaryPreset === 'next-excellent' }" @click="applySummaryFilter('next-excellent')"><span>Next.js 优秀网站</span><strong>{{ dashboard.totals.excellent_nextjs || 0 }}</strong><small>Next.js · 日点击 ≥30</small></button>
            </section>

            <div class="workbench-grid">
                <section ref="domainLedgerRef" class="domain-ledger" aria-labelledby="domain-list-title" :aria-busy="loading">
                    <div class="ledger-toolbar">
                        <div class="ledger-title"><h2 id="domain-list-title">域名列表</h2><span class="record-count" role="status">{{ loading ? '正在加载…' : loadError ? '加载失败' : `${filteredDomains.length} / ${domains.length} 个域名` }}</span></div>
                        <div class="ledger-actions" aria-label="域名管理操作">
                            <el-button :icon="Refresh" :loading="refreshing" :disabled="loading || !!loadError" @click="handleRefresh">刷新</el-button>
                            <el-button type="primary" :icon="Plus" @click="handleAdd">新增域名</el-button>
                            <el-button :icon="Upload" @click="handleImport">导入</el-button>
                            <el-button :icon="Download" @click="handleExport">导出</el-button>
                            <el-button @click="resourceManagerVisible = true">资源管理</el-button>
                            <el-button @click="adsenseManagerVisible = true">AdSense 管理</el-button>
                            <el-button :icon="Setting" @click="handleConfig">通知配置</el-button>
                            <el-button :icon="sidebarCollapsed ? Expand : Fold" :aria-expanded="!sidebarCollapsed" :title="sidebarCollapsed ? '显示概览' : '隐藏概览'" @click="toggleSidebar">{{ sidebarCollapsed ? '显示概览' : '隐藏概览' }}</el-button>
                            <el-dropdown>
                                <el-button class="more-button">更多</el-button>
                                <template #dropdown><el-dropdown-menu><el-dropdown-item @click="handleJsonExport">导出 JSON 备份</el-dropdown-item><el-dropdown-item @click="handleLogout">登出</el-dropdown-item></el-dropdown-menu></template>
                            </el-dropdown>
                        </div>
                    </div>
                    <div class="domain-filters">
                        <el-input v-model="searchText" :prefix-icon="Search" placeholder="搜索域名、网站名称、行业、备注" clearable />
                        <el-select v-model="ownerFilter" placeholder="归属人" clearable><el-option v-for="owner in ownerOptions" :key="owner" :label="owner" :value="owner" /></el-select>
                        <el-select v-model="accountFilter" placeholder="AdSense账号" clearable><el-option v-for="account in adsenseAccounts" :key="account.id" :label="account.name" :value="String(account.id)" /></el-select>
                        <el-select v-model="adsenseFilter" placeholder="AdSense 状态" clearable><el-option label="已开通" value="已开通" /><el-option label="未开通" value="未开通" /><el-option label="未知" value="未知" /></el-select>
                        <el-select v-model="seoFilter" placeholder="SEO 状态" clearable @change="activeSummaryPreset = ''"><el-option label="从未优化" value="never" /><el-option label="最近 7 天" value="recent" /><el-option label="超过 7 天" value="7" /><el-option label="超过 30 天" value="30" /><el-option label="30 天未优化" value="stale30" /></el-select>
                        <el-select v-model="clicksFilter" placeholder="日点击" clearable @change="activeSummaryPreset = ''"><el-option label="未填写" value="unknown" /><el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30 次及以上" value="over30" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" /></el-select>
                        <el-select v-model="resourceFilter" placeholder="资源状态" clearable><el-option label="已关联" value="linked" /><el-option label="未关联" value="unlinked" /></el-select>
                        <el-select v-model="providerFilter" placeholder="服务商" clearable><el-option v-for="provider in providerOptions" :key="provider" :label="providerLabel(provider)" :value="provider" /></el-select>
                        <el-select v-model="resourceAccountFilter" placeholder="服务商账号" clearable><el-option v-for="option in resourceAccountOptions" :key="option.value" :label="`${providerLabel(option.provider)} · ${option.account}`" :value="option.value" /></el-select>
                        <el-select v-model="platformFilter" placeholder="技术栈" clearable @change="activeSummaryPreset = ''"><el-option v-for="platform in platformOptions" :key="platform" :label="platform" :value="platform" /></el-select>
                        <el-select v-model="industryFilter" placeholder="行业" filterable clearable><el-option v-for="industry in industryOptions" :key="industry" :label="industry" :value="industry" /></el-select>
                        <el-select v-model="expiryFilter" placeholder="到期时间" clearable @change="activeSummaryPreset = ''"><el-option label="30 天内到期" value="within30" /><el-option label="已过期" value="expired" /><el-option label="30 天后" value="after30" /></el-select>
                        <el-button @click="clearFilters">清除筛选</el-button>
                    </div>
                    <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><el-button @click="loadDomains">重试</el-button></div>
                    <el-table :data="filteredDomains" v-loading="loading" element-loading-text="正在加载域名…" class="custom-table" :default-sort="{ prop: 'expiry_date', order: 'ascending' }">
                        <el-table-column prop="site_name" label="网站名称" min-width="126" fixed sortable><template #default="scope"><button type="button" class="table-inline-text" @click="openQuickField(scope.row, 'site_name')">{{ scope.row.site_name || '未命名' }}</button></template></el-table-column>
                        <el-table-column prop="domain" label="域名" min-width="162" fixed sortable><template #default="scope"><a :href="'https://' + scope.row.domain" target="_blank" rel="noopener noreferrer" class="domain-link">{{ scope.row.domain }}</a></template></el-table-column>
                        <el-table-column label="SEO" width="54"><template #default="scope"><div class="seo-cell" :class="`seo-${seoState(scope.row).kind}`"><button v-if="seoState(scope.row).actionable" type="button" class="seo-check-button seo-icon-only" :title="seoState(scope.row).title" :aria-label="seoState(scope.row).title" @click="handleSeoToday(scope.row)"><el-icon><Check /></el-icon></button><span v-else class="seo-locked seo-icon-only" :title="seoState(scope.row).title"><el-icon><Lock /></el-icon></span></div></template></el-table-column>
                        <el-table-column prop="industry" label="行业" min-width="96" sortable><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.industry || ''" placeholder="未分类" clearable filterable @change="value => handleInlineSelect(scope.row, 'industry', value)"><el-option v-for="industry in industryOptions" :key="industry" :label="industry" :value="industry" /></el-select></template></el-table-column>
                        <el-table-column label="日点击" min-width="96" sortable><template #default="scope"><el-select class="inline-select click-range-select" size="small" :model-value="scope.row.daily_clicks_range || clickRangeFromNumber(scope.row.daily_clicks) || ''" placeholder="未填写" clearable @change="value => handleDailyClicks(scope.row, value)"><el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" /></el-select></template></el-table-column>
                        <el-table-column prop="platform" label="技术栈" min-width="98" sortable><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.platform" @change="value => handleInlineSelect(scope.row, 'platform', value)"><el-option v-for="platform in platformOptions" :key="platform" :label="platformText({ ...scope.row, platform })" :value="platform" /></el-select></template></el-table-column>
                        <el-table-column label="AdSense" min-width="94" sortable><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.adsense_connected" @change="value => handleAdsenseSelect(scope.row, value)"><el-option label="未知" value="未知" /><el-option label="已开通" value="已开通" /><el-option label="未开通" value="未开通" /></el-select></template></el-table-column>
                        <el-table-column label="最近操作" min-width="88" sortable><template #default="scope">{{ scope.row.latest_operation_date || '未记录' }}</template></el-table-column>
                        <el-table-column prop="registrar_date" label="注册时间" min-width="92" sortable><template #default="scope">{{ scope.row.registrar_date || '未记录' }}</template></el-table-column>
                        <el-table-column label="剩余时间" min-width="92" sortable :sort-method="(a, b) => calculateRemainingDays(a.expiry_date) - calculateRemainingDays(b.expiry_date)"><template #default="scope"><span class="expiry-label" :class="expiryClass(scope.row.expiry_date)">{{ formatRemainingDays(scope.row.expiry_date) }}</span></template></el-table-column>
                        <el-table-column prop="status" label="状态" min-width="72" sortable><template #default="scope"><el-select class="inline-select" size="small" :model-value="scope.row.status" @change="value => handleInlineSelect(scope.row, 'status', value)"><el-option label="在线" value="在线" /><el-option label="离线" value="离线" /></el-select></template></el-table-column>
                        <el-table-column label="操作" width="112"><template #default="scope"><div class="row-actions row-icon-actions"><el-button text :icon="Document" title="详情" aria-label="详情" @click="openDomainDetail(scope.row)" /><el-button text :icon="Edit" title="修改" aria-label="修改" @click="handleEdit(scope.row)" /><el-button text type="danger" :icon="Delete" title="删除" aria-label="删除" @click="handleDelete(scope.row)" /></div></template></el-table-column>
                        <template #empty><div class="empty-state" v-if="!loading && !loadError"><p>还没有域名</p><span>新增或导入域名后，会在此显示。</span><button type="button" class="table-action" @click="handleAdd">新增域名</button></div><div v-else class="empty-state"><span>{{ loading ? '正在加载域名…' : '域名列表未能加载，请重试。' }}</span></div></template>
                    </el-table>
                    <p class="table-scroll-hint">左右滑动查看全部字段和操作。</p>
                </section>

                <button v-if="!sidebarCollapsed" type="button" class="sidebar-backdrop" aria-label="关闭概览" @click="toggleSidebar"></button>
                <aside class="dashboard-sidebar" aria-label="管理概览">
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>AdSense 收入</h2><button class="sidebar-link" @click="adsenseManagerVisible = true">管理</button></div><div v-if="dashboard.owner_income.length" class="sidebar-list"><div v-for="item in dashboard.owner_income" :key="`${item.owner}-${item.currency}`" class="sidebar-row"><span>{{ item.owner }}<small>{{ item.account_count }} 个账号 · {{ item.currency }} · 本月</small></span><strong>{{ item.currency }} {{ Number(item.current_income || 0).toFixed(2) }}</strong></div></div><p v-else class="sidebar-empty">暂无月收入</p></section>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>最久未 SEO</h2></div><div v-if="dashboard.seo.length" class="sidebar-list"><div v-for="item in dashboard.seo" :key="item.id" class="sidebar-row"><span>{{ item.domain }}<small>{{ item.seo_last_date || '从未优化' }} · {{ item.days_since ?? '—' }} 天</small></span><button v-if="seoState(item).actionable" class="sidebar-link" @click="markSeoById(item.id)">今天优化</button><span v-else class="sidebar-seo-locked" :title="seoState(item).title"><el-icon><Lock /></el-icon></span></div></div><p v-else class="sidebar-empty">暂无网站</p></section>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>日点击分布</h2></div><div class="click-summary"><span>未填写 <strong>{{ dashboard.clicks.unknown || 0 }}</strong></span><span>&lt;10 <strong>{{ dashboard.clicks.under_10 || 0 }}</strong></span><span>10–29 <strong>{{ dashboard.clicks.from_10_to_29 || 0 }}</strong></span><span>30–49 <strong>{{ dashboard.clicks.from_30_to_49 || 0 }}</strong></span><span>50–99 <strong>{{ dashboard.clicks.from_50_to_99 || 0 }}</strong></span><span>≥100 <strong>{{ dashboard.clicks.over_100 || 0 }}</strong></span></div></section>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>基础设施</h2><button class="sidebar-link" @click="resourceManagerVisible = true">管理</button></div><div class="provider-summary"><div v-for="item in dashboard.providers" :key="item.provider"><span>{{ providerLabel(item.provider) }}</span><strong>{{ item.account_count }} 账号 · {{ item.resource_count }} 资源 · {{ item.linked_domain_count }} 网站</strong></div></div></section>
                </aside>
            </div>
        </main>

        <DomainDialog v-model:visible="dialogVisible" :is-edit="isEdit" :edit-data="editData" :accounts="adsenseAccounts" @submit="handleDialogSubmit" />
        <AlertConfigDialog v-model:visible="configVisible" :config="alertConfig" @submit="handleConfigSubmit" />
        <ImportDialog v-model:visible="importVisible" @success="reloadAll" />
        <AdsenseManagerDialog v-model:visible="adsenseManagerVisible" :accounts="adsenseAccounts" @changed="reloadAll" />
        <ResourceManagerDialog v-model:visible="resourceManagerVisible" @changed="reloadAll" />
        <DomainDetailDrawer v-model:visible="detailVisible" :domain="detailDomain" @changed="loadDomains" />
        <QuickFieldDialog v-model:visible="quickFieldVisible" :title="quickFieldTitle" :context="quickFieldDomain?.domain" :label="quickFieldLabel" :value="quickFieldValue" :placeholder="quickFieldPlaceholder" :maxlength="quickFieldMode === 'platform_other' ? 100 : 200" @save="saveQuickField" />
        <AdsenseQuickDialog v-model:visible="adsenseQuickVisible" :domain="adsenseQuickDomain?.domain" :accounts="adsenseAccounts" :account-id="adsenseQuickDomain?.adsense_account_id" :opened-date="adsenseQuickDomain?.adsense_opened_date" :registrar-date="adsenseQuickDomain?.registrar_date" @save="saveAdsenseQuick" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Setting, Refresh, Plus, Upload, Download, Search, Fold, Expand, Check, Lock, Document, Edit, Delete } from '@element-plus/icons-vue';
import '../styles/home/home.css';
import { useAuth } from '../utils/auth';
import DomainDialog from '../components/DomainDialog.vue';
import AlertConfigDialog from '../components/AlertConfigDialog.vue';
import ImportDialog from '../components/ImportDialog.vue';
import AdsenseManagerDialog from '../components/AdsenseManagerDialog.vue';
import ResourceManagerDialog from '../components/ResourceManagerDialog.vue';
import DomainDetailDrawer from '../components/DomainDetailDrawer.vue';
import QuickFieldDialog from '../components/QuickFieldDialog.vue';
import AdsenseQuickDialog from '../components/AdsenseQuickDialog.vue';
import { createDomain, updateDomain, deleteDomain, type DomainData } from '../api/domains';
import { getWriteQueue } from '../utils/writeQueue';
import { api, ApiError } from '../utils/request';
import { confirmAction, isDismissed } from '../utils/feedback';

interface AlertConfig { tg_token: string; tg_userid: string; days: number; }

const router = useRouter();
const auth = useAuth();
const domains = ref<DomainData[]>([]);
const adsenseAccounts = ref<Array<{ id?: number; name: string; owner: string; publisher_id?: string | null; currency: string; status: string; memo: string; linked_domains?: number }>>([]);
const adsenseManagerVisible = ref(false);
const resourceManagerVisible = ref(false);
const queue = getWriteQueue();
const searchText = ref('');
const ownerFilter = ref('');
const accountFilter = ref('');
const adsenseFilter = ref('');
const seoFilter = ref('');
const clicksFilter = ref('');
const expiryFilter = ref('');
const resourceFilter = ref('');
const providerFilter = ref('');
const resourceAccountFilter = ref('');
const platformFilter = ref('');
const industryFilter = ref('');
const activeSummaryPreset = ref('');
const domainLedgerRef = ref<HTMLElement>();
const storedSidebarState = localStorage.getItem('domain-manager.sidebar-collapsed');
const sidebarCollapsed = ref(storedSidebarState === null ? window.innerWidth <= 760 : storedSidebarState === '1');
const loading = ref(false);
const loadError = ref('');
const alertDays = ref(30);
const alertConfig = ref<AlertConfig>();
const refreshing = ref(false);
const dialogVisible = ref(false);
const configVisible = ref(false);
const isEdit = ref(false);
const editData = ref<DomainData>();
const importVisible = ref(false);
const detailVisible = ref(false);
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
interface DashboardData { totals: Record<string, number>; seo: Array<{ id: number; domain: string; seo_last_date: string | null; days_since: number | null }>; clicks: Record<string, number>; providers: Array<{ provider: string; account_count: number; resource_count: number; linked_domain_count: number }>; owner_income: Array<{ owner: string; currency: string; account_count: number; current_income: number }>; platforms: Array<{ platform: string; count: number }>; quality: Record<string, number> }
interface ResourceLinkData { id: number; domain_id: number; resource_id: number; role: string; provider: string; account_id: number | null; account_name: string | null; resource_name: string }
interface ResourceAccountData { id: number; provider: string; name: string; status: string; linked_domain_count: number }
const dashboard = ref<DashboardData>({ totals: {}, seo: [], clicks: {}, providers: [], owner_income: [], platforms: [], quality: {} });
const resourceLinks = ref<ResourceLinkData[]>([]);
const resourceAccounts = ref<ResourceAccountData[]>([]);
const accountById = computed(() => new Map(adsenseAccounts.value.map(account => [account.id, account])));
const ownerOptions = computed(() => [...new Set(adsenseAccounts.value.map(account => account.owner).filter(Boolean))]);
const providerOptions = ['github', 'cloudflare', 'vhost', 'vps'];
const resourceAccountOptions = computed(() => resourceAccounts.value.filter(account => account.status === '正常').map(account => ({ provider: account.provider, account: account.name, value: String(account.id) })));
const platformOptions = ['WordPress', 'Astro', 'Next.js', '其他'];
const industryBaseOptions = ['电气/工程', '工业/制造', '酒店/旅游', '家居/装修', '软件/工具', '健康/医疗', '教育', '其他'];
const industryOptions = computed(() => [...new Set([...industryBaseOptions, ...domains.value.map(domain => domain.industry).filter((value): value is string => Boolean(value))])]);
const filteredDomains = computed(() => domains.value.filter(row => {
    const account = accountById.value.get(row.adsense_account_id || undefined);
    const haystack = `${row.domain} ${row.site_name || ''} ${row.industry || ''} ${row.registrar} ${row.memo}`.toLowerCase();
    if (searchText.value && !haystack.includes(searchText.value.trim().toLowerCase())) return false;
    if (ownerFilter.value && account?.owner !== ownerFilter.value) return false;
    if (accountFilter.value && String(row.adsense_account_id || '') !== accountFilter.value) return false;
    if (adsenseFilter.value && row.adsense_connected !== adsenseFilter.value) return false;
    if (seoFilter.value) { const days = row.seo_last_date ? daysSince(row.seo_last_date) : null; if (seoFilter.value === 'never' && days !== null) return false; if (seoFilter.value === 'recent' && (days === null || days > 7)) return false; if (seoFilter.value === '7' && (days === null || days < 7)) return false; if (seoFilter.value === '30' && (days === null || days < 30)) return false; if (seoFilter.value === 'stale30' && days !== null && days <= 30) return false; }
    if (clicksFilter.value && !matchesClicks(row, clicksFilter.value)) return false;
    if (expiryFilter.value && !matchesExpiry(row.expiry_date, expiryFilter.value)) return false;
    if (resourceFilter.value === 'linked' && !row.resource_count) return false;
    if (resourceFilter.value === 'unlinked' && row.resource_count) return false;
    const links = resourceLinks.value.filter(link => link.domain_id === row.id);
    if (providerFilter.value && !links.some(link => link.provider === providerFilter.value)) return false;
    if (resourceAccountFilter.value && !links.some(link => String(link.account_id || '') === resourceAccountFilter.value)) return false;
    if (platformFilter.value && row.platform !== platformFilter.value) return false;
    if (industryFilter.value && row.industry !== industryFilter.value) return false;
    return true;
}));

const checkLoginStatus = () => { if (!auth.getAuthToken()) router.push({ name: 'Login' }); };
const handleLogout = () => { auth.clearAuth(); router.push({ name: 'Login' }); };
const handleAdd = () => { isEdit.value = false; editData.value = undefined; dialogVisible.value = true; };
const handleEdit = (row: DomainData) => { isEdit.value = true; editData.value = row; dialogVisible.value = true; };
const openDomainDetail = (row: DomainData) => { detailDomain.value = row; detailVisible.value = true; };
const handleConfig = () => { configVisible.value = true; };
const handleImport = () => { importVisible.value = true; };
const clearFilters = () => { searchText.value = ''; ownerFilter.value = ''; accountFilter.value = ''; adsenseFilter.value = ''; seoFilter.value = ''; clicksFilter.value = ''; expiryFilter.value = ''; resourceFilter.value = ''; providerFilter.value = ''; resourceAccountFilter.value = ''; platformFilter.value = ''; industryFilter.value = ''; activeSummaryPreset.value = ''; };
const daysSince = (date: string) => { const [y,m,d] = date.split('-').map(Number); const today = localDate().split('-').map(Number); return Math.max(0, Math.floor((Date.UTC(today[0], today[1] - 1, today[2]) - Date.UTC(y, m - 1, d)) / 86400000)); };
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const toggleSidebar = () => { sidebarCollapsed.value = !sidebarCollapsed.value; localStorage.setItem('domain-manager.sidebar-collapsed', sidebarCollapsed.value ? '1' : '0'); };
const matchesExpiry = (date: string, filter: string) => { const days = calculateRemainingDays(date); return filter === 'within30' ? days >= 0 && days <= 30 : filter === 'expired' ? days < 0 : filter === 'after30' ? days > 30 : true; };
const applySummaryFilter = async (preset: 'all' | 'expiring' | 'seo-stale' | 'wordpress-excellent' | 'astro-excellent' | 'next-excellent') => {
    expiryFilter.value = '';
    seoFilter.value = '';
    platformFilter.value = '';
    clicksFilter.value = '';
    activeSummaryPreset.value = preset;
    if (preset === 'expiring') expiryFilter.value = 'within30';
    if (preset === 'seo-stale') seoFilter.value = 'stale30';
    if (preset === 'wordpress-excellent') { platformFilter.value = 'WordPress'; clicksFilter.value = 'over30'; }
    if (preset === 'astro-excellent') { platformFilter.value = 'Astro'; clicksFilter.value = 'over30'; }
    if (preset === 'next-excellent') { platformFilter.value = 'Next.js'; clicksFilter.value = 'over30'; }
    await nextTick();
    domainLedgerRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const seoState = (row: Pick<DomainData, 'seo_last_date'> | { seo_last_date: string | null }) => {
    if (!row.seo_last_date) return { kind: 'never', actionable: true, label: '未优化', title: '从未优化，点击记录今天' };
    const days = daysSince(row.seo_last_date);
    if (days <= 15) return { kind: 'recent', actionable: false, label: `${days} 天前`, title: `最近 ${days} 天前优化，第 15 天内不可重复操作` };
    if (days <= 30) return { kind: 'stale', actionable: true, label: `${days} 天前`, title: `最近 ${days} 天前优化，可以再次安排` };
    return { kind: 'overdue', actionable: true, label: `${days} 天前`, title: `已经 ${days} 天未优化，建议优先处理` };
};
const clickRangeFromNumber = (value: number | null | undefined) => value == null ? null : value < 10 ? 'under10' : value < 30 ? '10to29' : value < 50 ? '30to49' : value < 100 ? '50to99' : 'over100';
const matchesClicks = (row: DomainData, filter: string) => { const range = row.daily_clicks_range || clickRangeFromNumber(row.daily_clicks); return filter === 'unknown' ? range == null : filter === 'over30' ? ['30to49', '50to99', 'over100'].includes(range || '') : range === filter; };
const handleSeoToday = async (row: DomainData) => { if (!row.id || !seoState(row).actionable) return; const date = localDate(); try { queue.enqueue({ type: 'domain_patch', id: row.id, fields: { seo_last_date: date } }); queue.enqueue({ type: 'domain_operation_add', domain_id: row.id, operation_date: date, operation_kind: 'SEO' }); row.seo_last_date = date; row.latest_operation_date = date; await queue.flush(); await loadDashboard(); ElMessage.success('已记录今天的 SEO 优化'); } catch(error) { ElMessage.error(error instanceof Error ? error.message : 'SEO 日期已加入待同步队列'); } };
const handleDailyClicks = async (row: DomainData, value: string | null) => { if (!row.id) return; const previous = row.daily_clicks_range; row.daily_clicks_range = value as DomainData['daily_clicks_range']; row.daily_clicks = null; row.clicks_updated_date = value == null ? null : localDate(); try { queue.enqueue({ type: 'domain_patch', id: row.id, fields: { daily_clicks: null, daily_clicks_range: value, clicks_updated_date: row.clicks_updated_date } }); await queue.flush(); await loadDashboard(); } catch (error) { row.daily_clicks_range = previous; ElMessage.error(error instanceof Error ? error.message : '日点击区间已加入待同步队列'); } };
const markSeoById = (id: number) => { const row = domains.value.find(item => item.id === id); if (row) void handleSeoToday(row); };
const providerLabel = (value: string) => ({ github: 'GitHub', cloudflare: 'Cloudflare', vhost: '虚拟主机', vps: 'VPS' }[value] || value);
const platformText = (row: DomainData) => row.platform === '其他' ? (row.platform_other || '其他') : row.platform;
const handleInlineSelect = async (row: DomainData, field: 'status' | 'platform' | 'industry', value: string | null) => {
    if (!row.id) return;
    const oldValue = row[field];
    if (oldValue === value) return;
    if (field === 'platform' && value === '其他') { row.platform_other = null; }
    row[field] = value as never;
    try { await api.patch(`/api/domains/${row.id}`, { [field]: value || null }); if (field === 'platform' && value !== '其他') row.platform_other = null; if (field === 'platform' && value === '其他') openQuickField(row, 'platform_other'); }
    catch (error) { row[field] = oldValue as never; ElMessage.error(error instanceof Error ? error.message : '保存失败'); }
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
    if (!row.id) return;
    const previous = { adsense_connected: row.adsense_connected, adsense_account_id: row.adsense_account_id, adsense_opened_date: row.adsense_opened_date };
    row.adsense_connected = status;
    if (extra.adsense_account_id !== undefined) row.adsense_account_id = extra.adsense_account_id;
    if (extra.adsense_opened_date !== undefined) row.adsense_opened_date = extra.adsense_opened_date;
    try {
        const updated = await api.patch<DomainData>(`/api/domains/${row.id}`, { adsense_connected: status, ...extra });
        Object.assign(row, updated);
    } catch (error) {
        Object.assign(row, previous);
        ElMessage.error(error instanceof Error ? error.message : 'AdSense 状态保存失败');
    }
};
const saveAdsenseQuick = async (value: { adsense_account_id: number; adsense_opened_date: string }) => {
    const row = adsenseQuickDomain.value;
    if (row) await saveAdsenseStatus(row, '已开通', value);
};
const openQuickField = (row: DomainData, mode: 'site_name' | 'platform_other') => { quickFieldDomain.value = row; quickFieldMode.value = mode; quickFieldVisible.value = true; };
const saveQuickField = async (value: string | null) => {
    const row = quickFieldDomain.value; if (!row?.id) return;
    const field = quickFieldMode.value; const oldValue = row[field]; row[field] = value as never;
    try { await api.patch(`/api/domains/${row.id}`, { [field]: value }); }
    catch (error) { row[field] = oldValue as never; ElMessage.error(error instanceof Error ? error.message : '保存失败'); }
};
const loadAdsenseAccounts = async () => { try { adsenseAccounts.value = await api.get(`/api/adsense/accounts?month=${localDate().slice(0, 7)}`); } catch(error) { console.error('获取 AdSense 账号失败:', error); } };
const loadDashboard = async () => { try { const today = localDate(); dashboard.value = await api.get(`/api/dashboard/summary?today=${today}&month=${today.slice(0, 7)}`); } catch (error) { console.error('获取首页概览失败:', error); } };
const loadResourceLinks = async () => { try { [resourceLinks.value, resourceAccounts.value] = await Promise.all([api.get<ResourceLinkData[]>('/api/resources/links'), api.get<ResourceAccountData[]>('/api/resources/accounts')]); } catch (error) { console.error('获取资源关联失败:', error); } };
const reloadAll = async () => { await Promise.all([loadDomains(), loadAdsenseAccounts(), loadDashboard(), loadResourceLinks()]); };

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
    try {
        if (isEdit.value && editData.value?.id) {
            await updateDomain(editData.value.id, formData);
        } else {
            await createDomain(formData);
        }
        dialogVisible.value = false;
        await loadDomains();
    } catch (error: unknown) { ElMessage.error(error instanceof Error ? error.message : '操作失败'); }
};

const loadDomains = async () => {
    loading.value = true;
    loadError.value = '';
    try {
        domains.value = await api.get<DomainData[]>('/api/domains');
    } catch (error: any) {
        loadError.value = error.message || '加载域名列表失败，请重试。';
        if (error instanceof ApiError && error.status === 401) { auth.clearAuth(); router.push({ name: 'Login' }); }
    } finally {
        loading.value = false;
    }
};

const calculateRemainingDays = (expiryDate: string) => {
    const [year, month, day] = expiryDate.split('-').map(Number);
    const [todayYear, todayMonth, todayDay] = localDate().split('-').map(Number);
    const todayDate = Date.UTC(todayYear, todayMonth - 1, todayDay);
    return Math.round((Date.UTC(year, month - 1, day) - todayDate) / 86400000);
};

const formatRemainingDays = (expiryDate: string) => {
    const days = calculateRemainingDays(expiryDate);
    if (days < 0) return `已过期 ${Math.abs(days)} 天`;
    if (days === 0) return '今日到期';
    return `${days} 天`;
};

const expiryClass = (expiryDate: string) => {
    const days = calculateRemainingDays(expiryDate);
    return days < 0 ? 'expiry-expired' : days <= alertDays.value ? 'expiry-warning' : '';
};

const handleConfigSubmit = async (config: AlertConfig) => {
    try {
        await api.post('/api/alertconfig', config);
        ElMessage.success('配置保存成功');
        alertDays.value = config.days;
        alertConfig.value = config;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '保存配置失败';
        ElMessage.error(errorMessage);
        if (error instanceof ApiError && error.status === 401) { auth.clearAuth(); router.push({ name: 'Login' }); }
    }
};

const handleRefresh = async () => {
    if (refreshing.value) return;
    refreshing.value = true;
    try {
        const checkDomainStatus = async (domain: string): Promise<string> => {
            try {
                const result = await api.post<{ status: string }>('/api/domains/check', { domain });
                if (!['在线', '离线'].includes(result.status)) throw new Error('状态检查结果无效');
                return result.status;
            } catch (error) { throw error; }
        };
        let checkedCount = 0;
        let changedCount = 0;
        for (let index = 0; index < domains.value.length; index += 4) {
            const group = domains.value.slice(index, index + 4);
            const checked = await Promise.all(group.map(async item => ({ item, status: await checkDomainStatus(item.domain) })));
            checked.forEach(({ item, status }) => {
                if (item.id) {
                    const checkedDate = localDate();
                    const needsWrite = item.status !== status || item.last_status_check_at?.slice(0, 10) !== checkedDate;
                    if (needsWrite) queue.enqueue({ type: 'domain_patch', id: item.id, fields: { status, last_status_check_at: checkedDate } });
                    checkedCount += 1;
                    if (item.status !== status) changedCount += 1;
                }
                item.status = status;
            });
            if (queue.pending.value.length >= 175) await queue.flush();
        }
        await queue.flush();
        await reloadAll();
        ElMessage.success(`已检查 ${checkedCount} 个网站，${changedCount} 个状态发生变化`);
    } catch (error: unknown) {
        ElMessage.error(error instanceof Error ? error.message : '刷新状态失败');
    } finally {
        refreshing.value = false;
    }
};

const loadAlertConfig = async () => {
    try {
        const result = await api.get<AlertConfig>('/api/alertconfig');
        if (result) {
            alertConfig.value = result;
            alertDays.value = result.days;
        }
    } catch (error) { console.error('获取告警配置失败:', error); }
};

const handleExport = async () => {
    const loading = ElMessage.info({ message: '正在准备导出数据...', duration: 0 });
    try {
        const snapshot = await api.get<any>('/api/export/snapshot');
        const XLSX = await import('xlsx');
        const workbook = XLSX.utils.book_new();
        const sensitiveKey = /pass(word)?|token|ciphertext|secret|credential/i;
        const safeRows = (rows: unknown[]) => rows.map(row => Object.fromEntries(Object.entries((row || {}) as Record<string, unknown>).filter(([key]) => !sensitiveKey.test(key))));
        const sheets: Array<[string, unknown[]]> = [
            ['域名总表', safeRows(snapshot.domains || [])],
            ['操作记录', safeRows(snapshot.operations || [])],
            ['AdSense账号', safeRows(snapshot.adsense_accounts || [])],
            ['AdSense月收入', safeRows(snapshot.adsense_income || [])],
            ['基础设施账号', safeRows(snapshot.provider_accounts || [])],
            ['基础设施资源', safeRows(snapshot.provider_resources || [])],
            ['网站资源关联', safeRows(snapshot.domain_resources || [])],
            ['AI提示词与想法', safeRows(snapshot.ai_notes || [])]
        ];
        for (const [name, rows] of sheets) {
            const sheet = XLSX.utils.json_to_sheet(rows);
            const columns = rows.length ? Object.keys(rows[0] as Record<string, unknown>) : [];
            sheet['!cols'] = columns.map(column => ({ wch: Math.min(42, Math.max(12, ...rows.map(row => String((row as Record<string, unknown>)[column] ?? '').length + 2))) }));
            XLSX.utils.book_append_sheet(workbook, sheet, name);
        }
        XLSX.writeFile(workbook, `domain-manager-${localDate()}.xlsx`);
        ElMessage.success('导出成功');
    } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '导出失败');
    } finally {
        loading.close();
    }
};

const handleJsonExport = async () => {
    try {
        const download = await api.download('/api/domains/export');
        const filename = download.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `domains-export.json`;
        const blob = download.blob;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); window.URL.revokeObjectURL(url);
        ElMessage.success('JSON 备份已导出');
    } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败'); }
};

onMounted(() => {
    checkLoginStatus();
    void loadDomains();
    void loadAlertConfig();
    void loadAdsenseAccounts();
    void loadDashboard();
    void loadResourceLinks();
    void queue.flush();
});
</script>
