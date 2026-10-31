<template>
    <div class="home-container">
        <main class="workspace">
            <section class="summary-grid" aria-label="概览">
                <div class="summary-card"><span>域名总数</span><strong>{{ dashboard.totals.total_domains || domains.length }}</strong></div>
                <div class="summary-card"><span>30 天内到期</span><strong>{{ dashboard.totals.expiring_domains || 0 }}</strong></div>
                <div class="summary-card"><span>资源待补全</span><strong>{{ dashboard.totals.incomplete_resources || 0 }}</strong></div>
                <div class="summary-card sync-summary"><span>待同步任务</span><strong>{{ queue.pending.value.length }}</strong><span v-if="failedQueueCount" class="sync-failure">{{ failedQueueCount }} 项失败</span><button v-if="queue.pending.value.length" type="button" class="sidebar-link" @click="syncNow">立即同步</button><button v-if="failedQueueCount" type="button" class="sidebar-link" @click="retryFailedWrites">重试失败项</button></div>
            </section>

            <div class="workbench-grid">
                <section class="domain-ledger" aria-labelledby="domain-list-title" :aria-busy="loading">
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
                            <el-dropdown>
                                <el-button class="more-button">更多</el-button>
                                <template #dropdown><el-dropdown-menu><el-dropdown-item @click="handleLogout">登出</el-dropdown-item></el-dropdown-menu></template>
                            </el-dropdown>
                        </div>
                    </div>
                    <div class="domain-filters">
                        <el-input v-model="searchText" :prefix-icon="Search" placeholder="搜索域名、域名商、备注" clearable />
                        <el-select v-model="ownerFilter" placeholder="归属人" clearable><el-option v-for="owner in ownerOptions" :key="owner" :label="owner" :value="owner" /></el-select>
                        <el-select v-model="accountFilter" placeholder="AdSense账号" clearable><el-option v-for="account in adsenseAccounts" :key="account.id" :label="account.name" :value="String(account.id)" /></el-select>
                        <el-select v-model="adsenseFilter" placeholder="AdSense 状态" clearable><el-option label="已开通" value="已开通" /><el-option label="未开通" value="未开通" /><el-option label="未知" value="未知" /></el-select>
                        <el-select v-model="seoFilter" placeholder="SEO 状态" clearable><el-option label="从未优化" value="never" /><el-option label="最近 7 天" value="recent" /><el-option label="超过 7 天" value="7" /><el-option label="超过 30 天" value="30" /></el-select>
                        <el-select v-model="clicksFilter" placeholder="日点击" clearable><el-option label="未填写" value="unknown" /><el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" /></el-select>
                        <el-select v-model="resourceFilter" placeholder="资源状态" clearable><el-option label="已关联" value="linked" /><el-option label="未关联" value="unlinked" /></el-select>
                        <el-select v-model="providerFilter" placeholder="服务商" clearable><el-option v-for="provider in providerOptions" :key="provider" :label="providerLabel(provider)" :value="provider" /></el-select>
                        <el-select v-model="resourceAccountFilter" placeholder="服务商账号" clearable><el-option v-for="option in resourceAccountOptions" :key="option.value" :label="`${providerLabel(option.provider)} · ${option.account}`" :value="option.value" /></el-select>
                        <el-button @click="clearFilters">清除筛选</el-button>
                    </div>
                    <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><el-button @click="loadDomains">重试</el-button></div>
                    <el-table :data="filteredDomains" v-loading="loading" element-loading-text="正在加载域名…" class="custom-table" :default-sort="{ prop: 'expiry_date', order: 'ascending' }">
                        <el-table-column prop="domain" label="域名" min-width="200" fixed sortable><template #default="scope"><a :href="'https://' + scope.row.domain" target="_blank" rel="noopener noreferrer" class="domain-link">{{ scope.row.domain }}</a></template></el-table-column>
                        <el-table-column label="剩余时间" min-width="128" sortable :sort-method="(a, b) => calculateRemainingDays(a.expiry_date) - calculateRemainingDays(b.expiry_date)"><template #default="scope"><span class="expiry-label" :class="expiryClass(scope.row.expiry_date)">{{ formatRemainingDays(scope.row.expiry_date) }}</span></template></el-table-column>
                        <el-table-column prop="status" label="状态" min-width="88" sortable><template #default="scope"><span class="status-label" :class="scope.row.status === '在线' ? 'status-online' : 'status-offline'">{{ scope.row.status }}</span></template></el-table-column>
                        <el-table-column prop="adsense_connected" label="AdSense" min-width="112" sortable />
                        <el-table-column label="最近 SEO" min-width="112" sortable><template #default="scope">{{ scope.row.seo_last_date || '未记录' }}</template></el-table-column>
                        <el-table-column label="日点击" min-width="100"><template #default="scope">{{ clickBucket(scope.row.daily_clicks) }}</template></el-table-column>
                        <el-table-column label="部署位置" min-width="180" show-overflow-tooltip><template #default="scope">{{ scope.row.resource_names || '未关联' }}</template></el-table-column>
                        <el-table-column prop="expiry_date" label="过期时间" min-width="128" sortable />
                        <el-table-column prop="registrar" label="域名商" min-width="136" sortable><template #default="scope"><a v-if="scope.row.registrar_link" :href="scope.row.registrar_link" target="_blank" rel="noopener noreferrer" class="registrar-link">{{ scope.row.registrar }}</a><span v-else>{{ scope.row.registrar }}</span></template></el-table-column>
                        <el-table-column prop="registrar_date" label="注册时间" min-width="128" sortable />
                        <el-table-column prop="service_type" label="服务类型" min-width="112" sortable />
                        <el-table-column prop="memo" label="备注" min-width="160" show-overflow-tooltip />
                        <el-table-column label="操作" width="190"><template #default="scope"><div class="row-actions"><button type="button" class="table-action" @click="handleEdit(scope.row)">修改</button><button type="button" class="table-action" @click="handleSeoToday(scope.row)" :title="`最近：${formatSeoAge(scope.row.seo_last_date)}`">今天优化</button><button type="button" class="table-action table-action-danger" @click="handleDelete(scope.row)">删除</button></div></template></el-table-column>
                        <template #empty><div class="empty-state" v-if="!loading && !loadError"><p>还没有域名</p><span>新增或导入域名后，会在此显示。</span><button type="button" class="table-action" @click="handleAdd">新增域名</button></div><div v-else class="empty-state"><span>{{ loading ? '正在加载域名…' : '域名列表未能加载，请重试。' }}</span></div></template>
                    </el-table>
                    <p class="table-scroll-hint">左右滑动查看全部字段和操作。</p>
                </section>

                <aside class="dashboard-sidebar" aria-label="管理概览">
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>AdSense 收入</h2><button class="sidebar-link" @click="adsenseManagerVisible = true">管理</button></div><div v-if="dashboard.owner_income.length" class="sidebar-list"><div v-for="item in dashboard.owner_income" :key="`${item.owner}-${item.currency}`" class="sidebar-row"><span>{{ item.owner }}<small>{{ item.account_count }} 个账号 · {{ item.currency }} · 本月</small></span><strong>{{ item.currency }} {{ Number(item.current_income || 0).toFixed(2) }}</strong></div></div><p v-else class="sidebar-empty">暂无月收入</p></section>
                    <section class="sidebar-panel"><div class="sidebar-title"><h2>最久未 SEO</h2></div><div v-if="dashboard.seo.length" class="sidebar-list"><div v-for="item in dashboard.seo" :key="item.id" class="sidebar-row"><span>{{ item.domain }}<small>{{ item.seo_last_date || '从未优化' }} · {{ item.days_since ?? '—' }} 天</small></span><button class="sidebar-link" @click="markSeoById(item.id)">今天优化</button></div></div><p v-else class="sidebar-empty">暂无网站</p></section>
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
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Setting, Refresh, Plus, Upload, Download, Search } from '@element-plus/icons-vue';
import '../styles/home/home.css';
import { useAuth } from '../utils/auth';
import DomainDialog from '../components/DomainDialog.vue';
import AlertConfigDialog from '../components/AlertConfigDialog.vue';
import ImportDialog from '../components/ImportDialog.vue';
import AdsenseManagerDialog from '../components/AdsenseManagerDialog.vue';
import ResourceManagerDialog from '../components/ResourceManagerDialog.vue';
import { createDomain, updateDomain, deleteDomain, type DomainData } from '../api/domains';
import { getWriteQueue } from '../utils/writeQueue';

interface AlertConfig { tg_token: string; tg_userid: string; days: number; }
interface ApiResponse<T = any> { status: number; message: string; data: T; }

const router = useRouter();
const auth = useAuth();
const domains = ref<DomainData[]>([]);
const adsenseAccounts = ref<Array<{ id?: number; name: string; owner: string; currency: string; status: string; memo: string; linked_domains?: number }>>([]);
const adsenseManagerVisible = ref(false);
const resourceManagerVisible = ref(false);
const queue = getWriteQueue();
const failedQueueCount = computed(() => queue.pending.value.filter(item => item.blocked).length);
const searchText = ref('');
const ownerFilter = ref('');
const accountFilter = ref('');
const adsenseFilter = ref('');
const seoFilter = ref('');
const clicksFilter = ref('');
const resourceFilter = ref('');
const providerFilter = ref('');
const resourceAccountFilter = ref('');
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
interface DashboardData { totals: Record<string, number>; seo: Array<{ id: number; domain: string; seo_last_date: string | null; days_since: number | null }>; clicks: Record<string, number>; providers: Array<{ provider: string; account_count: number; resource_count: number; linked_domain_count: number }>; owner_income: Array<{ owner: string; currency: string; account_count: number; current_income: number }> }
interface ResourceLinkData { id: number; domain_id: number; resource_id: number; role: string; provider: string; account_id: number | null; account_name: string | null; resource_name: string }
interface ResourceAccountData { id: number; provider: string; name: string; status: string; linked_domain_count: number }
const dashboard = ref<DashboardData>({ totals: {}, seo: [], clicks: {}, providers: [], owner_income: [] });
const resourceLinks = ref<ResourceLinkData[]>([]);
const resourceAccounts = ref<ResourceAccountData[]>([]);
const accountById = computed(() => new Map(adsenseAccounts.value.map(account => [account.id, account])));
const ownerOptions = computed(() => [...new Set(adsenseAccounts.value.map(account => account.owner).filter(Boolean))]);
const providerOptions = ['github', 'cloudflare', 'vhost', 'vps'];
const resourceAccountOptions = computed(() => resourceAccounts.value.filter(account => account.status === '正常').map(account => ({ provider: account.provider, account: account.name, value: String(account.id) })));
const filteredDomains = computed(() => domains.value.filter(row => {
    const account = accountById.value.get(row.adsense_account_id || undefined);
    const haystack = `${row.domain} ${row.registrar} ${row.memo}`.toLowerCase();
    if (searchText.value && !haystack.includes(searchText.value.trim().toLowerCase())) return false;
    if (ownerFilter.value && account?.owner !== ownerFilter.value) return false;
    if (accountFilter.value && String(row.adsense_account_id || '') !== accountFilter.value) return false;
    if (adsenseFilter.value && row.adsense_connected !== adsenseFilter.value) return false;
    if (seoFilter.value) { const days = row.seo_last_date ? daysSince(row.seo_last_date) : null; if (seoFilter.value === 'never' && days !== null) return false; if (seoFilter.value === 'recent' && (days === null || days > 7)) return false; if (seoFilter.value === '7' && (days === null || days < 7)) return false; if (seoFilter.value === '30' && (days === null || days < 30)) return false; }
    if (clicksFilter.value && !matchesClicks(row.daily_clicks, clicksFilter.value)) return false;
    if (resourceFilter.value === 'linked' && !row.resource_count) return false;
    if (resourceFilter.value === 'unlinked' && row.resource_count) return false;
    const links = resourceLinks.value.filter(link => link.domain_id === row.id);
    if (providerFilter.value && !links.some(link => link.provider === providerFilter.value)) return false;
    if (resourceAccountFilter.value && !links.some(link => String(link.account_id || '') === resourceAccountFilter.value)) return false;
    return true;
}));

const checkLoginStatus = () => { if (!auth.getAuthToken()) router.push({ name: 'Login' }); };
const handleLogout = () => { auth.clearAuth(); router.push({ name: 'Login' }); };
const handleAdd = () => { isEdit.value = false; editData.value = undefined; dialogVisible.value = true; };
const handleEdit = (row: DomainData) => { isEdit.value = true; editData.value = row; dialogVisible.value = true; };
const handleConfig = () => { configVisible.value = true; };
const handleImport = () => { importVisible.value = true; };
const clearFilters = () => { searchText.value = ''; ownerFilter.value = ''; accountFilter.value = ''; adsenseFilter.value = ''; seoFilter.value = ''; clicksFilter.value = ''; resourceFilter.value = ''; providerFilter.value = ''; resourceAccountFilter.value = ''; };
const daysSince = (date: string) => { const [y,m,d] = date.split('-').map(Number); const today = localDate().split('-').map(Number); return Math.max(0, Math.floor((Date.UTC(today[0], today[1] - 1, today[2]) - Date.UTC(y, m - 1, d)) / 86400000)); };
const formatSeoAge = (date: string | null) => date ? `${daysSince(date)} 天前` : '未记录';
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const clickBucket = (value: number | null) => value === null || value === undefined ? '未填写' : value < 10 ? '<10' : value < 30 ? '10–29' : value < 50 ? '30–49' : value < 100 ? '50–99' : '≥100';
const matchesClicks = (value: number | null, filter: string) => filter === 'unknown' ? value === null || value === undefined : filter === 'under10' ? value !== null && value !== undefined && value < 10 : filter === '10to29' ? value !== null && value >= 10 && value <= 29 : filter === '30to49' ? value !== null && value >= 30 && value <= 49 : filter === '50to99' ? value !== null && value >= 50 && value <= 99 : filter === 'over100' ? value !== null && value >= 100 : true;
const handleSeoToday = async (row: DomainData) => { if (!row.id) return; const date = localDate(); try { queue.enqueue({ type: 'domain_patch', id: row.id, fields: { seo_last_date: date } }); row.seo_last_date = date; await queue.flush(); await loadDashboard(); ElMessage.success('已记录今天的 SEO 优化'); } catch(error) { ElMessage.error(error instanceof Error ? error.message : 'SEO 日期已加入待同步队列'); } };
const markSeoById = (id: number) => { const row = domains.value.find(item => item.id === id); if (row) void handleSeoToday(row); };
const providerLabel = (value: string) => ({ github: 'GitHub', cloudflare: 'Cloudflare', vhost: '虚拟主机', vps: 'VPS' }[value] || value);
const handleUnauthorized = (response: Response) => { if (response.status !== 401) return false; auth.clearAuth(); router.push({ name: 'Login' }); return true; };
const syncNow = async () => { try { if (!auth.getAuthToken()) throw new Error('请先重新登录'); await queue.flush(); if (queue.pending.value.length) throw new Error('部分任务仍未同步，任务已保留在本机'); await reloadAll(); ElMessage.success('待同步数据已写入') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '同步失败，任务仍保留在本机') } };
const retryFailedWrites = async () => { queue.retryFailed(); await syncNow(); };
const loadAdsenseAccounts = async () => { try { const authData=auth.getAuthToken(); const month=localDate().slice(0,7); const response=await fetch(`/api/adsense/accounts?month=${month}`,{headers:{'Authorization':`Bearer ${authData?.token || ''}`}}); if (handleUnauthorized(response)) return; const result=await response.json() as any; if (response.ok && result.status === 200) adsenseAccounts.value=result.data || []; else throw new Error(result.message || '获取 AdSense 账号失败'); } catch(error) { console.error('获取 AdSense 账号失败:', error); } };
const loadDashboard = async () => { try { const authData = auth.getAuthToken(); const today = localDate(); const response = await fetch(`/api/dashboard/summary?today=${today}&month=${today.slice(0,7)}`, { headers: { Authorization: `Bearer ${authData?.token || ''}` } }); if (handleUnauthorized(response)) return; const result = await response.json() as ApiResponse<DashboardData>; if (response.ok && result.status === 200 && result.data) dashboard.value = result.data; else throw new Error(result.message || '获取首页概览失败'); } catch (error) { console.error('获取首页概览失败:', error); } };
const loadResourceLinks = async () => { try { const authData = auth.getAuthToken(); const [linksResponse, accountsResponse] = await Promise.all([fetch('/api/resources/links', { headers: { Authorization: `Bearer ${authData?.token || ''}` } }), fetch('/api/resources/accounts', { headers: { Authorization: `Bearer ${authData?.token || ''}` } })]); if (handleUnauthorized(linksResponse) || handleUnauthorized(accountsResponse)) return; const linksResult = await linksResponse.json() as ApiResponse<ResourceLinkData[]>; const accountsResult = await accountsResponse.json() as ApiResponse<ResourceAccountData[]>; if (!linksResponse.ok || linksResult.status !== 200 || !accountsResponse.ok || accountsResult.status !== 200) throw new Error(linksResult.message || accountsResult.message || '读取资源关联失败'); resourceLinks.value = linksResult.data || []; resourceAccounts.value = accountsResult.data || []; } catch (error) { console.error('获取资源关联失败:', error); } };
const reloadAll = async () => { await Promise.all([loadDomains(), loadAdsenseAccounts(), loadDashboard(), loadResourceLinks()]); };

const handleDelete = async (row: DomainData) => {
    try {
        await ElMessageBox.confirm('确定要删除该域名吗？', '提示', { type: 'warning' });
        if (row.id) {
            await deleteDomain(row.id);
            await reloadAll();
        }
    } catch (error) { if (error !== 'cancel') ElMessage.error('删除失败'); }
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
    } catch (error: any) { ElMessage.error(error.response?.data?.message || '操作失败'); }
};

const loadDomains = async () => {
    loading.value = true;
    loadError.value = '';
    try {
        const authData = auth.getAuthToken();
        if (!authData) throw new Error('未登录或登录已过期');
        const response = await fetch('/api/domains', { headers: { 'Authorization': `Bearer ${authData.token}` } });
        if (!response.ok) {
            if (handleUnauthorized(response)) throw new Error('登录状态无效，请重新登录');
            const errorData = await response.json() as { message: string };
            throw new Error(errorData.message || '请求失败');
        }
        const result = await response.json() as ApiResponse<DomainData[]>;
        if (result.status !== 200) throw new Error(result.message || '请求失败');
        domains.value = result.data || [];
    } catch (error: any) {
        loadError.value = error.message || '加载域名列表失败，请重试。';
        if (error.message.includes('授权') || error.message.includes('令牌')) { auth.clearAuth(); router.push({ name: 'Login' }); }
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
        const authData = auth.getAuthToken();
        if (!authData) throw new Error('未登录或登录已过期');
        const response = await fetch('/api/alertconfig', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.token}` }, body: JSON.stringify(config) });
        const result = await response.json() as ApiResponse;
        if (result.status !== 200) throw new Error(result.message || '保存失败');
        ElMessage.success('配置保存成功');
        alertDays.value = config.days;
        alertConfig.value = config;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '保存配置失败';
        ElMessage.error(errorMessage);
        if (errorMessage.includes('授权') || errorMessage.includes('令牌')) { auth.clearAuth(); router.push({ name: 'Login' }); }
    }
};

const handleRefresh = async () => {
    if (refreshing.value) return;
    refreshing.value = true;
    try {
        const checkDomainStatus = async (domain: string): Promise<string> => {
            try {
                const authData = auth.getAuthToken();
                if (!authData) throw new Error('未授权');
                const response = await fetch('/api/domains/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.token}` }, body: JSON.stringify({ domain }) });
                if (handleUnauthorized(response)) throw new Error('登录状态无效，请重新登录');
                if (!response.ok) throw new Error(`状态检查 API 失败：${response.status}`);
                const result = await response.json() as ApiResponse<{ status: string }>;
                if (result.status !== 200 || !result.data || !['在线', '离线'].includes(result.data.status)) throw new Error(result.message || '状态检查结果无效');
                return result.data.status;
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
        const authData = auth.getAuthToken();
        if (!authData) return;
        const response = await fetch('/api/alertconfig', { headers: { 'Authorization': `Bearer ${authData.token}` } });
        const result = await response.json() as ApiResponse<AlertConfig>;
        if (result.status === 200 && result.data) {
            alertConfig.value = result.data;
            alertDays.value = result.data.days;
        }
    } catch (error) { console.error('获取告警配置失败:', error); }
};

const handleExport = async () => {
    const loading = ElMessage.info({ message: '正在准备导出数据...', duration: 0 });
    try {
        const authData = auth.getAuthToken();
        if (!authData) throw new Error('未登录或登录已过期');
        const response = await fetch('/api/domains/export', { headers: { 'Authorization': `Bearer ${authData.token}` } });
        if (!response.ok) {
            const errorData = await response.json() as { message: string };
            throw new Error(errorData.message || '导出失败');
        }
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `domains-export.json`;
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        ElMessage.success('导出成功');
    } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '导出失败');
    } finally {
        loading.close();
    }
};

onMounted(() => {
    document.documentElement.classList.add('dm-home-route');
    checkLoginStatus();
    void loadDomains();
    void loadAlertConfig();
    void loadAdsenseAccounts();
    void loadDashboard();
    void loadResourceLinks();
    void queue.flush();
});
onBeforeUnmount(() => {
    document.documentElement.classList.remove('dm-home-route');
});
</script>
