<template>
    <div class="home-container">
        <AppHeader>
            <el-button class="logout-button" :icon="SwitchButton" @click="handleLogout">登出</el-button>
        </AppHeader>

        <main class="workspace">
            <div class="page-heading">
                <div>
                    <h1>域名管理系统</h1>
                    <p>管理域名、到期时间和服务状态。</p>
                </div>
                <el-button type="primary" :icon="Plus" @click="handleAdd">新增域名</el-button>
            </div>

            <section class="domain-ledger" aria-labelledby="domain-list-title" :aria-busy="loading">
                <div class="ledger-toolbar">
                    <div class="ledger-title">
                        <h2 id="domain-list-title">域名列表</h2>
                        <span class="record-count" role="status">{{ loading ? '正在加载…' : loadError ? '加载失败' : `${domains.length} 个域名` }}</span>
                    </div>
                    <div class="ledger-actions" aria-label="域名管理操作">
                        <el-button :icon="Refresh" :loading="refreshing" :disabled="loading || !!loadError" @click="handleRefresh">刷新状态</el-button>
                        <el-button :icon="Upload" @click="handleImport">导入</el-button>
                        <el-button :icon="Download" @click="handleExport">导出</el-button>
                        <el-button :icon="Setting" @click="handleConfig">通知配置</el-button>
                    </div>
                </div>

                <div v-if="loadError" class="load-error" role="alert">
                    <span>{{ loadError }}</span>
                    <el-button @click="loadDomains">重试</el-button>
                </div>

                <el-table :data="domains" v-loading="loading" element-loading-text="正在加载域名…" class="custom-table" :default-sort="{ prop: 'expiry_date', order: 'ascending' }">
                    <el-table-column prop="domain" label="域名" min-width="200" fixed sortable>
                        <template #default="scope">
                            <a :href="'https://' + scope.row.domain" target="_blank" rel="noopener noreferrer" class="domain-link">{{ scope.row.domain }}</a>
                        </template>
                    </el-table-column>
                    <el-table-column label="剩余时间" min-width="128" sortable :sort-method="(a, b) => calculateRemainingDays(a.expiry_date) - calculateRemainingDays(b.expiry_date)">
                        <template #default="scope">
                            <span class="expiry-label" :class="expiryClass(scope.row.expiry_date)">{{ formatRemainingDays(scope.row.expiry_date) }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column prop="status" label="状态" min-width="88" sortable>
                        <template #default="scope">
                            <span class="status-label" :class="scope.row.status === '在线' ? 'status-online' : 'status-offline'">{{ scope.row.status }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column prop="expiry_date" label="过期时间" min-width="128" sortable />
                    <el-table-column prop="registrar" label="域名商" min-width="136" sortable>
                        <template #default="scope">
                            <a v-if="scope.row.registrar_link" :href="scope.row.registrar_link" target="_blank" rel="noopener noreferrer" class="registrar-link">{{ scope.row.registrar }}</a>
                            <span v-else>{{ scope.row.registrar }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column prop="registrar_date" label="注册时间" min-width="128" sortable />
                    <el-table-column prop="service_type" label="服务类型" min-width="112" sortable />
                    <el-table-column prop="memo" label="备注" min-width="160" sortable show-overflow-tooltip />
                    <el-table-column label="操作" width="136">
                        <template #default="scope">
                            <div class="row-actions">
                                <button type="button" class="table-action" @click="handleEdit(scope.row)">修改</button>
                                <button type="button" class="table-action table-action-danger" @click="handleDelete(scope.row)">删除</button>
                            </div>
                        </template>
                    </el-table-column>
                    <template #empty>
                        <div class="empty-state" v-if="!loading && !loadError">
                            <p>还没有域名</p>
                            <span>新增或导入域名后，会在此显示。</span>
                            <button type="button" class="table-action" @click="handleAdd">新增域名</button>
                        </div>
                        <div v-else class="empty-state"><span>{{ loading ? '正在加载域名…' : '域名列表未能加载，请重试。' }}</span></div>
                    </template>
                </el-table>
                <p class="table-scroll-hint">左右滑动查看全部字段和操作。</p>
            </section>

            <AppFooter />
        </main>

        <DomainDialog v-model:visible="dialogVisible" :is-edit="isEdit" :edit-data="editData" @submit="handleDialogSubmit" />
        <AlertConfigDialog v-model:visible="configVisible" :config="alertConfig" @submit="handleConfigSubmit" />
        <ImportDialog v-model:visible="importVisible" @success="loadDomains" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Setting, Refresh, Plus, SwitchButton, Upload, Download } from '@element-plus/icons-vue';
import '../styles/home/home.css';
import { useAuth } from '../utils/auth';
import AppHeader from '../components/AppHeader.vue';
import AppFooter from '../components/AppFooter.vue';
import DomainDialog from '../components/DomainDialog.vue';
import AlertConfigDialog from '../components/AlertConfigDialog.vue';
import ImportDialog from '../components/ImportDialog.vue';
import { createDomain, updateDomain, deleteDomain, type DomainData } from '../api/domains';

interface AlertConfig { tg_token: string; tg_userid: string; days: number; }
interface ApiResponse<T = any> { status: number; message: string; data: T; }

const router = useRouter();
const auth = useAuth();
const domains = ref<DomainData[]>([]);
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

const checkLoginStatus = () => { if (!auth.getAuthToken()) router.push({ name: 'Login' }); };
const handleLogout = () => { auth.clearAuth(); router.push({ name: 'Login' }); };
const handleAdd = () => { isEdit.value = false; editData.value = undefined; dialogVisible.value = true; };
const handleEdit = (row: DomainData) => { isEdit.value = true; editData.value = row; dialogVisible.value = true; };
const handleConfig = () => { configVisible.value = true; };
const handleImport = () => { importVisible.value = true; };

const handleDelete = async (row: DomainData) => {
    try {
        await ElMessageBox.confirm('确定要删除该域名吗？', '提示', { type: 'warning' });
        if (row.id) {
            await deleteDomain(row.id);
            await loadDomains();
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
    const today = new Date();
    const todayDate = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
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
                const result = await response.json() as ApiResponse<{ status: string }>;
                return result.status === 200 && result.data ? result.data.status : '离线';
            } catch { return '离线'; }
        };
        const updateDomainStatus = async (domain: string, status: string): Promise<DomainData> => {
            const authData = auth.getAuthToken();
            if (!authData) throw new Error('未授权');
            const response = await fetch('/api/domains/status', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.token}` }, body: JSON.stringify({ domain, status }) });
            const result = await response.json() as ApiResponse<DomainData>;
            if (result.status === 200 && result.data) return result.data;
            throw new Error(result.message || '更新失败');
        };
        const updatedDomains = await Promise.all(domains.value.map(async (domainItem) => {
            const status = await checkDomainStatus(domainItem.domain);
            return await updateDomainStatus(domainItem.domain, status);
        }));
        domains.value = updatedDomains;
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
    loadDomains();
    loadAlertConfig();
});
onBeforeUnmount(() => {
    document.documentElement.classList.remove('dm-home-route');
});
</script>
