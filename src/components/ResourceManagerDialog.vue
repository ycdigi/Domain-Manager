<template>
  <el-dialog v-model="dialogVisible" title="基础设施资源" width="960px" :close-on-click-modal="false" class="resource-manager-dialog">
    <el-tabs v-model="activeTab">
      <el-tab-pane v-for="provider in providers" :key="provider.value" :label="provider.label" :name="provider.value">
        <div class="resource-toolbar">
          <span>{{ provider.label }}账号与资源</span>
          <el-button type="primary" size="small" @click="openAccountForm">新增账号</el-button>
          <el-button v-if="activeTab === 'vps'" size="small" @click="openResourceForm">新增 VPS</el-button>
        </div>
        <el-table :data="accountsForProvider" size="small" stripe>
          <el-table-column prop="name" label="账号" min-width="150" />
          <el-table-column prop="login_email" label="登录邮箱" min-width="180" />
          <el-table-column prop="resource_count" label="资源数" width="80" />
          <el-table-column prop="linked_domain_count" label="网站数" width="80" />
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column label="操作" width="220">
            <template #default="scope">
              <el-button text size="small" @click="selectAccount(scope.row)">查看资源</el-button>
              <el-button v-if="scope.row.provider === 'github'" text size="small" @click="openCredential(scope.row)">Token</el-button>
              <el-button text size="small" @click="editAccount(scope.row)">编辑</el-button>
              <el-button text size="small" type="warning" :disabled="scope.row.status === '停用'" @click="disableAccount(scope.row)">停用</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="selectedAccount" class="resource-section">
          <div class="resource-toolbar">
            <span>{{ selectedAccount.name }} 的资源</span>
            <el-button size="small" @click="openResourceForm">新增资源</el-button>
          </div>
          <el-table :data="accountResources" size="small">
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column prop="resource_url" label="地址" min-width="220" show-overflow-tooltip />
            <el-table-column prop="ip_address" label="IP" width="140" />
            <el-table-column prop="linked_domain_count" label="网站数" width="80" />
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column label="操作" width="100">
              <template #default="scope"><el-button text size="small" @click="openLinkForm(scope.row)">关联网站</el-button><el-button text size="small" @click="editResource(scope.row)">编辑</el-button><el-button text size="small" type="warning" @click="disableResource(scope.row)">停用</el-button></template>
            </el-table-column>
          </el-table>
          <div v-for="resource in accountResources" :key="`links-${resource.id}`" class="resource-links">
            <strong>{{ resource.name }}</strong>
            <span v-for="link in linksForResource(resource.id)" :key="link.id" class="resource-link-row">
              {{ domainName(link.domain_id) }} · {{ link.role }}
              <el-button text size="small" type="danger" @click="unlink(link.id)">解除</el-button>
            </span>
          </div>
        </div>
        <div v-if="activeTab === 'vps' && unassignedResources.length" class="resource-section">
          <div class="resource-toolbar"><span>未关联服务商账号的 VPS</span></div>
          <el-table :data="unassignedResources" size="small">
            <el-table-column prop="name" label="服务器" min-width="140" />
            <el-table-column prop="ip_address" label="IP 地址" width="150" />
            <el-table-column prop="linked_domain_count" label="网站数" width="80" />
            <el-table-column label="操作" width="160"><template #default="scope"><el-button text size="small" @click="openLinkForm(scope.row)">关联网站</el-button><el-button text size="small" @click="editResource(scope.row)">编辑</el-button></template></el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="accountFormVisible" :title="editingAccount ? '编辑基础设施账号' : '新增基础设施账号'" width="460px" append-to-body>
      <el-form :model="accountForm" label-width="90px">
        <el-form-item label="服务商"><el-select v-model="accountForm.provider" style="width:100%"><el-option v-for="item in providers" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="账号名称"><el-input v-model="accountForm.name" /></el-form-item>
        <el-form-item label="登录邮箱"><el-input v-model="accountForm.login_email" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="accountForm.memo" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="accountFormVisible = false">取消</el-button><el-button type="primary" @click="saveAccount">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="resourceFormVisible" :title="editingResourceId ? '编辑资源' : '新增资源'" width="520px" append-to-body>
      <el-form :model="resourceForm" label-width="90px">
        <el-form-item v-if="activeTab !== 'vps'" label="账号"><el-select v-model="resourceForm.account_id" style="width:100%"><el-option v-for="item in accountsForProvider" :key="item.id" :label="item.name" :value="item.id || 0" /></el-select></el-form-item>
        <el-form-item v-else label="服务商账号"><el-select v-model="resourceForm.account_id" clearable style="width:100%"><el-option label="不关联账号" :value="0" /><el-option v-for="item in accountsForProvider" :key="item.id" :label="item.name" :value="item.id || 0" /></el-select></el-form-item>
        <el-form-item label="资源名称"><el-input v-model="resourceForm.name" /></el-form-item>
        <el-form-item label="项目/面板地址"><el-input v-model="resourceForm.resource_url" /></el-form-item>
        <el-form-item label="标识/Zone"><el-input v-model="resourceForm.identifier" /></el-form-item>
        <el-form-item label="IP 地址"><el-input v-model="resourceForm.ip_address" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="resourceForm.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="地区"><el-input v-model="resourceForm.region" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="resourceForm.memo" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="resourceFormVisible = false">取消</el-button><el-button type="primary" @click="saveResource">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="credentialVisible" title="GitHub Token" width="520px" append-to-body>
      <el-form :model="credentialForm" label-width="90px">
        <el-form-item label="账号"><span>{{ selectedAccount?.name }}</span></el-form-item>
        <el-form-item label="名称"><el-input v-model="credentialForm.label" /></el-form-item>
        <el-form-item label="完整 Token"><el-input v-model="credentialForm.token" show-password /></el-form-item>
        <el-form-item label="到期日期"><el-date-picker v-model="credentialForm.expires_at" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
      </el-form>
      <div v-if="credentials.length" class="credential-list">
        <div v-for="item in credentials" :key="item.id" class="credential-row">
          <span>{{ item.label }} · ****{{ item.token_last4 || '' }}</span>
          <el-button text size="small" @click="revealCredential(item.id)">显示完整</el-button>
          <el-button text size="small" @click="editCredential(item)">编辑</el-button>
          <el-button text size="small" type="danger" @click="deleteCredential(item)">删除</el-button>
        </div>
      </div>
      <template #footer><el-button @click="credentialVisible = false">取消</el-button><el-button type="primary" @click="saveCredential">保存 Token</el-button></template>
    </el-dialog>

    <el-dialog v-model="linkVisible" title="关联网站" width="460px" append-to-body>
      <el-form :model="linkForm" label-width="90px">
        <el-form-item label="资源"><span>{{ linkResource?.name }}</span></el-form-item>
        <el-form-item label="网站"><el-select v-model="linkForm.domain_id" filterable style="width:100%"><el-option v-for="domain in domains" :key="domain.id" :label="domain.domain" :value="domain.id || 0" /></el-select></el-form-item>
        <el-form-item label="角色"><el-select v-model="linkForm.role" style="width:100%"><el-option v-for="role in roles" :key="role" :label="role" :value="role" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="linkVisible = false">取消</el-button><el-button type="primary" @click="saveLink">保存</el-button></template>
    </el-dialog>

    <template #footer><el-button @click="dialogVisible = false">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useAuth } from '../utils/auth'
import type { ProviderAccount, ProviderCredential, ProviderResource, ProviderType } from '../../functions/types'

const props = defineProps<{ visible: boolean }>()
const router = useRouter()
const emit = defineEmits<{ (event: 'update:visible', value: boolean): void; (event: 'changed'): void }>()
const dialogVisible = ref(props.visible)
const activeTab = ref<ProviderType>('github')
const providers = [{ value: 'github', label: 'GitHub' }, { value: 'cloudflare', label: 'Cloudflare' }, { value: 'vhost', label: '虚拟主机' }, { value: 'vps', label: 'VPS' }] as const
const accounts = ref<ProviderAccount[]>([])
const resources = ref<ProviderResource[]>([])
const selectedAccount = ref<ProviderAccount>()
const accountFormVisible = ref(false)
const resourceFormVisible = ref(false)
const credentialVisible = ref(false)
const linkVisible = ref(false)
const accountForm = ref<Partial<ProviderAccount>>({ provider: 'github', name: '', login_email: '', memo: '' })
const resourceForm = ref<Partial<ProviderResource> & { account_id?: number; port?: number }>({ provider: 'github', account_id: undefined, name: '', resource_url: '', identifier: '', ip_address: '', port: undefined, region: '', memo: '' })
const credentialForm = ref({ label: '', token: '', expires_at: '' })
const credentials = ref<ProviderCredential[]>([])
const editingCredentialId = ref<number>()
const domains = ref<Array<{ id?: number; domain: string }>>([])
const links = ref<Array<{ id: number; domain_id: number; resource_id: number; role: string }>>([])
const linkResource = ref<ProviderResource>()
const editingAccount = ref<number>()
const editingResourceId = ref<number>()
const linkForm = ref({ domain_id: undefined as number | undefined, role: '其他' })
const roles = ['代码仓库', 'DNS/CDN', '部署平台', '虚拟主机', 'VPS', '其他']

const accountsForProvider = computed(() => accounts.value.filter(item => item.provider === activeTab.value))
const accountResources = computed(() => resources.value.filter(item => item.account_id === selectedAccount.value?.id))
const unassignedResources = computed(() => resources.value.filter(item => item.provider === 'vps' && !item.account_id))
const authHeaders = () => { const token = useAuth().getAuthToken()?.token || ''; return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
const api = async (url: string, options: RequestInit = {}) => { const response = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } }); const result = await response.json() as { status: number; message: string; data: any }; if (response.status === 401) { useAuth().clearAuth(); await router.push({ name: 'Login' }); throw new Error('登录状态无效，请重新登录') } if (!response.ok || result.status >= 400) throw new Error(result.message || '请求失败'); return result.data }
const load = async () => { [accounts.value, resources.value, domains.value, links.value] = await Promise.all([api('/api/resources/accounts'), api('/api/resources'), api('/api/domains'), api('/api/resources/links')]); if (selectedAccount.value) selectedAccount.value = accounts.value.find(item => item.id === selectedAccount.value?.id) }
const openAccountForm = () => { editingAccount.value = undefined; accountForm.value = { provider: activeTab.value, name: '', login_email: '', memo: '' }; accountFormVisible.value = true }
const editAccount = (account: ProviderAccount) => { editingAccount.value = account.id; accountForm.value = { provider: account.provider, name: account.name, login_email: account.login_email, status: account.status, memo: account.memo }; accountFormVisible.value = true }
const saveAccount = async () => { try { const url = editingAccount.value ? `/api/resources/accounts/${editingAccount.value}` : '/api/resources/accounts'; await api(url, { method: editingAccount.value ? 'PUT' : 'POST', body: JSON.stringify(accountForm.value) }); accountFormVisible.value = false; await load(); emit('changed'); ElMessage.success('账号已保存') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') } }
const selectAccount = (account: ProviderAccount) => { selectedAccount.value = account; activeTab.value = account.provider }
const openResourceForm = () => { editingResourceId.value = undefined; resourceForm.value = { provider: activeTab.value, account_id: activeTab.value === 'vps' ? 0 : selectedAccount.value?.id, name: '', resource_url: '', identifier: '', ip_address: '', port: undefined, region: '', memo: '' }; resourceFormVisible.value = true }
const editResource = (resource: ProviderResource) => { editingResourceId.value = resource.id; activeTab.value = resource.provider; if (resource.account_id) selectedAccount.value = accounts.value.find(account => account.id === resource.account_id); resourceForm.value = { ...resource, account_id: resource.account_id ?? 0, port: resource.port ?? undefined }; resourceFormVisible.value = true }
const saveResource = async () => { try { const payload = { ...resourceForm.value, account_id: resourceForm.value.account_id || null }; const url = editingResourceId.value ? `/api/resources/resources/${editingResourceId.value}` : '/api/resources'; await api(url, { method: editingResourceId.value ? 'PUT' : 'POST', body: JSON.stringify(payload) }); resourceFormVisible.value = false; await load(); emit('changed'); ElMessage.success('资源已保存') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') } }
const disableAccount = async (account: ProviderAccount) => { try { await ElMessageBox.confirm(`停用“${account.name}”？关联记录会保留。`, '确认'); await api(`/api/resources/accounts/${account.id}`, { method: 'POST' }); await load(); emit('changed') } catch (error) { if (error !== 'cancel') ElMessage.error(error instanceof Error ? error.message : '停用失败') } }
const disableResource = async (resource: ProviderResource) => { try { await api(`/api/resources/resources/${resource.id}`, { method: 'POST' }); await load(); emit('changed') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '停用失败') } }
const openLinkForm = (resource: ProviderResource) => { linkResource.value = resource; linkForm.value = { domain_id: undefined, role: resource.provider === 'github' ? '代码仓库' : resource.provider === 'cloudflare' ? '部署平台' : resource.provider === 'vhost' ? '虚拟主机' : 'VPS' }; linkVisible.value = true }
const saveLink = async () => { try { if (!linkForm.value.domain_id || !linkResource.value?.id) throw new Error('请选择网站'); await api('/api/resources/links', { method: 'POST', body: JSON.stringify({ domain_id: linkForm.value.domain_id, resource_id: linkResource.value.id, role: linkForm.value.role }) }); linkVisible.value = false; await load(); emit('changed'); ElMessage.success('资源已关联') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '关联失败') } }
const linksForResource = (resourceId?: number) => links.value.filter(link => link.resource_id === resourceId)
const domainName = (domainId: number) => domains.value.find(domain => domain.id === domainId)?.domain || `网站 #${domainId}`
const unlink = async (id?: number) => { if (!id) return; try { await api(`/api/resources/links?id=${id}`, { method: 'DELETE' }); await load(); emit('changed') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '解除关联失败') } }
const openCredential = async (account: ProviderAccount) => { selectedAccount.value = account; editingCredentialId.value = undefined; credentialForm.value = { label: '', token: '', expires_at: '' }; credentials.value = await api(`/api/resources/credentials?account_id=${account.id}`); credentialVisible.value = true }
const editCredential = (item: ProviderCredential) => { editingCredentialId.value = item.id; credentialForm.value = { label: item.label, token: '', expires_at: item.expires_at || '' } }
const saveCredential = async () => { try { const id = editingCredentialId.value; const url = id ? `/api/resources/credentials/${id}` : '/api/resources/credentials'; await api(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ account_id: selectedAccount.value?.id, ...credentialForm.value }) }); credentials.value = await api(`/api/resources/credentials?account_id=${selectedAccount.value?.id}`); credentialForm.value = { label: '', token: '', expires_at: '' }; editingCredentialId.value = undefined; ElMessage.success('Token 已保存') } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Token 保存失败') } }
const deleteCredential = async (item: ProviderCredential) => { try { await ElMessageBox.confirm(`删除凭据“${item.label}”？`, '确认'); await api(`/api/resources/credentials/${item.id}`, { method: 'DELETE' }); credentials.value = await api(`/api/resources/credentials?account_id=${selectedAccount.value?.id}`) } catch (error) { if (error !== 'cancel') ElMessage.error(error instanceof Error ? error.message : '凭据删除失败') } }
const revealCredential = async (id?: number) => { if (!id) return; try { const result = await api(`/api/resources/credentials/${id}`, { method: 'POST' }); await ElMessageBox.alert(result.token, '完整 Token', { confirmButtonText: '复制并关闭', callback: () => { void navigator.clipboard?.writeText(result.token) } }) } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Token 读取失败') } }
watch(() => props.visible, value => { dialogVisible.value = value; if (value) void load() })
watch(dialogVisible, value => emit('update:visible', value))
</script>

<style scoped src="../styles/dialogs/resources.css"></style>
