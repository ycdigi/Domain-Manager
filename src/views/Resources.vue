<template>
 <div class="workspace-page">
  <WorkspaceHeading title="部署与账号" subtitle="Cloudflare、VPS、虚拟主机与 GitHub"><el-button :disabled="loading || saving" @click="refresh">刷新</el-button><el-button type="primary" @click="openAccountForm">新增账号</el-button><el-button v-if="activeTab === 'vps'" @click="openResourceForm">新增 VPS</el-button></WorkspaceHeading>
  <el-tabs :model-value="activeTab" @update:model-value="changeProvider"><el-tab-pane v-for="provider in providers" :key="provider.value" :name="provider.value" :label="provider.label" /></el-tabs>
  <div v-if="loadError || contextError" class="page-error" role="alert">{{ loadError || contextError }}<el-button v-if="loadError" @click="load(true)">重试</el-button><el-button v-else @click="router.push({ name: 'Resources', query: { provider: activeTab } })">返回当前服务商</el-button></div>
  <div v-if="tokenMigrationError" class="page-error" role="alert">{{ tokenMigrationError }}<el-button @click="load(true)">重试 Token 迁移</el-button></div>
  <section v-if="editor" class="page-panel resource-editor">
   <div class="panel-heading"><div><h2>{{ editorTitle }}</h2><p class="page-muted">保存后用于资源归属、网站关联和数量统计。</p></div><span class="editor-context-badge">{{ selectedAccount?.name || providerLabel(activeTab) }}</span></div>
   <el-form v-if="editor === 'account'" label-position="top" class="page-form resource-account-form" @submit.prevent="saveAccount">
    <div class="editor-provider-context"><span>服务商</span><strong>{{ providerLabel(activeTab) }}</strong><small>账号名称和登录邮箱用于区分同一服务商下的多个账号。</small></div>
    <div class="resource-account-grid"><el-form-item label="账号名称" required><el-input v-model="accountForm.name" placeholder="例如：个人 GitHub 主账号" /></el-form-item><el-form-item label="服务商名称"><el-input v-model="accountForm.provider_name" placeholder="例如 SiteGround、Hostinger" maxlength="120" /></el-form-item><el-form-item v-if="activeTab === 'github'" label="GitHub 用户名"><el-input v-model="accountForm.github_username" maxlength="39" /></el-form-item><el-form-item label="登录邮箱"><el-input v-model="accountForm.login_email" type="email" placeholder="用于识别登录入口" /></el-form-item><el-form-item v-if="activeTab === 'github'" class="resource-form-full" label="默认 GitHub Token"><el-input v-model="accountForm.token" type="password" show-password autocomplete="new-password" :placeholder="editingAccount ? '留空保留已保存的 Token，填写则替换默认 Token' : '填写 GitHub Token'" maxlength="8192" /><small v-if="selectedAccount?.default_token_last4" class="page-muted">已保存：****{{ selectedAccount.default_token_last4 }} · {{ selectedAccount.default_token_status }}</small></el-form-item><el-form-item class="resource-form-full" label="备注"><el-input v-model="accountForm.memo" type="textarea" :rows="3" placeholder="记录用途、权限范围或其他识别信息" /></el-form-item></div>
    <div class="page-actions resource-editor-actions"><el-button :disabled="saving" @click="cancelEditor">取消编辑</el-button><el-button type="primary" :loading="saving" native-type="submit">保存账号</el-button></div>
   </el-form>
   <el-form v-if="editor === 'resource'" label-position="top" class="page-form page-form-grid" @submit.prevent="saveResource">
    <el-form-item label="资源名称" required><el-input v-model="resourceForm.name" /></el-form-item><el-form-item label="服务商账号"><el-select v-model="resourceForm.account_id" :clearable="activeTab === 'vps'"><el-option v-if="activeTab === 'vps'" label="不关联账号" :value="0" /><el-option v-for="account in accountsForProvider" :key="account.id" :label="account.name" :value="account.id || 0" /></el-select></el-form-item>
    <el-form-item :label="activeTab === 'github' ? '仓库地址' : '项目 / 控制台地址'"><el-input v-model="resourceForm.resource_url" /></el-form-item><el-form-item v-if="activeTab === 'cloudflare'" label="项目 / Zone 标识"><el-input v-model="resourceForm.identifier" /></el-form-item><el-form-item v-if="activeTab === 'vps' || activeTab === 'vhost'" label="IP 地址"><el-input v-model="resourceForm.ip_address" /></el-form-item><el-form-item v-if="activeTab === 'vps'" label="端口"><el-input-number v-model="resourceForm.port" :min="1" :max="65535" /></el-form-item><el-form-item v-if="activeTab === 'vps' || activeTab === 'vhost'" label="到期日期"><el-date-picker v-model="resourceForm.expires_at" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item><el-form-item v-if="activeTab === 'vps' || activeTab === 'vhost'" label="地区"><el-input v-model="resourceForm.region" /></el-form-item><el-form-item label="备注"><el-input v-model="resourceForm.memo" type="textarea" :rows="2" /></el-form-item>
    <div class="page-actions page-form-full"><el-button :disabled="saving" @click="cancelEditor">取消编辑</el-button><el-button type="primary" :loading="saving" native-type="submit">保存资源</el-button></div>
   </el-form>
   <el-form v-if="editor === 'link'" label-position="top" class="page-form" @submit.prevent="saveLink">
    <el-form-item label="网站" required><el-select v-model="linkForm.website_id" filterable><el-option v-for="site in websites" :key="site.id" :label="site.name" :value="site.id" /></el-select></el-form-item><el-form-item v-if="linkResource" label="用途"><el-select v-model="linkForm.role"><el-option v-for="role in linkRoles" :key="role" :label="role" :value="role" /></el-select></el-form-item><el-form-item v-if="linkResource" label="该用途的主要资源"><el-switch v-model="linkForm.is_primary" /></el-form-item>
    <div class="page-actions"><el-button :disabled="saving" @click="cancelEditor">取消关联</el-button><el-button type="primary" :loading="saving" native-type="submit">保存关联</el-button></div>
   </el-form>
   <el-form v-if="editor === 'credential'" label-position="top" class="page-form" autocomplete="off" @submit.prevent="saveCredential">
    <el-form-item label="名称" required><el-input v-model="credentialForm.label" /></el-form-item><el-form-item label="默认凭据"><el-switch v-model="credentialForm.is_default" /></el-form-item><el-form-item :label="editingCredentialId ? '替换 Token（留空保留原值）' : '完整 Token'" :required="!editingCredentialId"><el-input v-model="credentialForm.token" show-password autocomplete="new-password" /></el-form-item><el-form-item label="到期日期"><el-date-picker v-model="credentialForm.expires_at" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
    <div class="page-actions"><el-button :disabled="saving" @click="cancelEditor">取消编辑</el-button><el-button type="primary" :loading="saving" native-type="submit">保存 Token</el-button></div>
   </el-form>
  </section>
  <section class="page-panel"><h2>{{ providerLabel(activeTab) }} 资源</h2><el-table :data="resources.filter(r=>r.provider===activeTab)" empty-text="暂无资源" @row-click="selectResource">
<el-table-column label="服务商"><template #default="{row}">{{ accounts.find(a=>a.id===row.account_id)?.provider_name || providerLabel(row.provider) }}</template></el-table-column>
<el-table-column prop="account_name" label="账号" />
<el-table-column prop="name" :label="activeTab==='github'?'仓库':'资源名称'" />
<el-table-column prop="resource_url" :label="activeTab==='github'?'仓库地址':'项目 / 控制台地址'" min-width="200" />
<el-table-column v-if="activeTab==='vps'||activeTab==='vhost'" prop="ip_address" label="IP" />
<el-table-column v-if="activeTab==='vps'" prop="region" label="地区" />
<el-table-column v-if="activeTab==='vps'||activeTab==='vhost'" prop="expires_at" label="到期日期" />
<el-table-column prop="linked_website_count" label="关联网站" /><el-table-column prop="status" label="状态" />
<el-table-column label="操作"><template #default="{row}"><el-button text @click.stop="selectResource(row)">查看 / 编辑</el-button></template></el-table-column></el-table></section>
  <div>
   <section class="page-panel" v-loading="loading"><div class="panel-heading"><h2>{{ providerLabel(activeTab) }} 账号</h2></div><el-table :data="accountsForProvider" empty-text="还没有账号" @row-click="selectAccount">
      <el-table-column prop="name" label="账号" /><el-table-column prop="login_email" label="Email" min-width="180" />
      <el-table-column v-if="activeTab === 'github'" label="默认 Token"><template #default="{row}">{{ row.default_token_last4 ? '****'+row.default_token_last4+' · '+row.default_token_status : '未设置' }}</template></el-table-column>
      <el-table-column prop="resource_count" :label="activeTab === 'github' ? '仓库数' : '资源数'" />
      <el-table-column label="关联网站"><template #default="{row}"><button class="page-link" @click.stop="showSites('provider_account',row.id)">{{ row.linked_website_count || 0 }}</button></template></el-table-column>
      <el-table-column label="操作" min-width="180"><template #default="{row}"><el-button text @click.stop="selectAccount(row)">详情</el-button><el-button text @click.stop="openResourceFormFor(row)">新增资源</el-button></template></el-table-column>
     </el-table>
   </section>
   <div>
    <section class="page-panel">
     <template v-if="selectedAccount"><div class="panel-heading"><div><h2>{{ selectedAccount.name }}</h2><p class="page-muted">{{ selectedAccount.login_email || '未记录邮箱' }} · {{ selectedAccount.status }}</p></div><div class="page-actions"><el-button :disabled="saving" @click="editAccount(selectedAccount)">编辑账号</el-button><el-button type="warning" :disabled="saving || selectedAccount.status === '停用'" @click="disableAccount(selectedAccount)">停用</el-button><el-button @click="openResourceForm">新增资源</el-button></div></div>
      <p class="page-muted">账号关系仅表示归属，不表示已配置托管或仓库。具体资源在资源表中管理。</p>
      <el-button @click="openAccountLink">关联网站账号</el-button>
      <ul class="page-list"><li v-for="link in selectedAccountLinks" :key="link.id"><button class="page-link" @click="openSite(link.website_id)">{{ link.website_name }}</button><el-button text @click="unlinkAccount(link.id)">解除账号关联</el-button></li></ul>
     </template><p v-else class="page-empty">选择账号或 VPS，查看资源与关联网站。</p>
    </section>
    <section v-if="selectedResource" class="page-panel"><div class="panel-heading"><div><h2>{{ selectedResource.name }}</h2><p class="page-muted">{{ selectedResource.resource_url || selectedResource.ip_address || '未记录地址' }}<template v-if="selectedResource.port">:{{ selectedResource.port }}</template> · {{ selectedResource.region || '未记录地区' }}</p></div><div class="page-actions"><el-button @click="editResource(selectedResource)">编辑资源</el-button><el-button type="warning" :disabled="saving || selectedResource.status === '停用'" @click="disableResource(selectedResource)">停用</el-button><el-button type="primary" @click="openLinkForm(selectedResource)">关联网站</el-button></div></div>
     <ul class="page-list"><li v-for="link in selectedLinks" :key="link.id"><div><button class="page-link" @click="openSite(link.website_id)">{{ siteName(link.website_id) }}</button><span class="page-muted"> · {{ link.role }}{{ link.is_primary ? ' · 主资源' : '' }}</span></div><el-button text type="danger" :disabled="saving" @click="unlink(link)">解除关联</el-button></li></ul><p v-if="!selectedLinks.length" class="page-muted">没有关联网站。</p>
    </section>
    <section v-if="selectedAccount?.provider === 'github'" class="page-panel"><div class="panel-heading"><h2>{{ selectedAccount.name }} · Token</h2><el-button @click="openCredential">新增凭据</el-button></div><div v-if="credentialError" class="page-error" role="alert">{{ credentialError }}<el-button @click="loadCredentials">重试</el-button></div><ul class="page-list"><li v-for="item in credentials" :key="item.id"><span>{{ item.label }}{{ item.is_default?' · 默认':'' }} · ****{{ item.token_last4 || '' }} · {{ item.expires_at || '未记录到期日' }}</span><div class="page-actions"><el-button text :disabled="saving" @click="revealCredential(item.id)">显示完整</el-button><el-button text @click="editCredential(item)">编辑</el-button><el-button text type="danger" :disabled="saving" @click="deleteCredential(item)">删除</el-button></div></li></ul><p v-if="!credentials.length" class="page-muted">没有凭据。</p>
     <div v-if="revealedToken" class="credential-reveal"><p class="page-muted">{{ revealedLabel }} · 仅本次查看显示</p><pre>{{ revealedToken }}</pre><div class="page-actions"><el-button @click="copyCredential">复制</el-button><el-button @click="clearRevealed">隐藏</el-button></div></div>
    </section>
   </div>
  </div>
 </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
import { cachedGet, invalidateData } from '../utils/workspaceCache'
import { resourceRoles, resourceSupportsRole } from '../../shared/resource-roles'
import { websiteQuery } from '../utils/website-location'
import { api } from '../utils/request'
import { confirmAction, isDismissed } from '../utils/feedback'
import { copyText } from '../utils/clipboard'
import type { ProviderAccount, ProviderCredential, ProviderResource, ProviderType } from '../../functions/types'
type Link = { id: number; website_id: number; resource_id: number; role: string; is_primary?: number }
type AccountLink = { id: number; account_id: number; website_id: number; website_name: string }
type Editor = '' | 'account' | 'resource' | 'link' | 'credential'
const route = useRoute(); const router = useRouter()
const providers = [{ value: 'github', label: 'GitHub' }, { value: 'cloudflare', label: 'Cloudflare' }, { value: 'vhost', label: '虚拟主机' }, { value: 'vps', label: 'VPS' }] as const
const providerLabel = (value: string) => providers.find(item => item.value === value)?.label || value
const activeTab = computed<ProviderType>(() => providers.some(p => p.value === route.query.provider) ? route.query.provider as ProviderType : 'github')
const accounts = ref<ProviderAccount[]>([]); const resources = ref<ProviderResource[]>([]); const links = ref<Link[]>([]); const websites = ref<Array<{ id: number; name: string }>>([])
const loading = ref(false); const loadError = ref(''); const saving = ref(false)
const selectedAccount = computed(() => accounts.value.find(item => item.provider === activeTab.value && String(item.id) === route.query.account))
const selectedResource = computed(() => resources.value.find(item => item.provider === activeTab.value && String(item.id) === route.query.resource && (!route.query.account || item.account_id === selectedAccount.value?.id)))
const accountsForProvider = computed(() => accounts.value.filter(item => item.provider === activeTab.value))
const accountLinks = ref<AccountLink[]>([])
const selectedAccountLinks = computed(() => accountLinks.value.filter(link => link.account_id === selectedAccount.value?.id))
const selectedLinks = computed(() => links.value.filter(item => item.resource_id === selectedResource.value?.id))
const contextError = computed(() => loading.value ? '' : route.query.provider && route.query.provider !== activeTab.value ? '服务商参数无效。' : route.query.account && !selectedAccount.value ? '该账号不存在或不属于当前服务商。' : route.query.resource && !selectedResource.value ? '该资源不存在或与当前账号不匹配。' : '')
const editor = ref<Editor>(''); const baseline = ref(''); const editingAccount = ref<number>(); const editingResourceId = ref<number>(); const editingCredentialId = ref<number>()
const accountForm = ref<Partial<ProviderAccount> & {token?:string}>({}); const resourceForm = ref<Partial<ProviderResource> & { port?: number; account_id?: number; expires_at?: string }>({}); const linkForm = ref({ website_id: undefined as number | undefined, role: '其他', is_primary: false }); const linkResource = ref<ProviderResource>()
const credentialForm = ref({ label: '', token: '', expires_at: '', is_default:false }); const credentials = ref<ProviderCredential[]>([]); const credentialError = ref(''); const revealedToken = ref(''); const revealedLabel = ref('')
const linkAccount = ref<number>()
const linkRoles = computed(() => resourceRoles.filter(role => resourceSupportsRole(linkResource.value?.provider || '', role)))
const editorTitle = computed(() => editor.value === 'account' ? (editingAccount.value ? `编辑账号：${accountForm.value.name}` : '新增账号') : editor.value === 'resource' ? (editingResourceId.value ? `编辑资源：${resourceForm.value.name}` : '新增资源') : editor.value === 'link' ? `关联网站：${linkResource.value?.name || selectedAccount.value?.name}` : `${editingCredentialId.value ? '编辑' : '新增'} Token：${selectedAccount.value?.name}`)
const snapshot = () => JSON.stringify(editor.value === 'account' ? accountForm.value : editor.value === 'resource' ? resourceForm.value : editor.value === 'link' ? linkForm.value : credentialForm.value)
const dirty = computed(() => Boolean(editor.value) && snapshot() !== baseline.value)
const { canDiscard } = useUnsavedChanges(dirty)
const markEditor = (value: Editor) => { if (editor.value === 'credential' && value !== 'credential') credentialForm.value.token = ''; editor.value = value; baseline.value = snapshot() }
let revealVersion = 0; let disposed = false
const clearRevealed = () => { revealVersion++; revealedToken.value = ''; revealedLabel.value = '' }
const clearSecrets = () => { accountForm.value.token = '';  clearRevealed(); credentialForm.value = { label: '', token: '', expires_at: '', is_default:false }; credentials.value = [] }
const cancelEditor = async () => { if (saving.value || !(await canDiscard())) return; editor.value = ''; baseline.value = ''; accountForm.value.token = ''; credentialForm.value.token = '' }
let version = 0; let credentialVersion = 0
const loadCredentials = async () => { const current = ++credentialVersion; credentials.value = []; credentialError.value = ''; if (selectedAccount.value?.provider !== 'github') return; try { const data = await api.get<ProviderCredential[]>(`/api/resources/credentials?account_id=${selectedAccount.value.id}`); if (current === credentialVersion) credentials.value = data } catch (e) { if (current === credentialVersion) credentialError.value = e instanceof Error ? e.message : '凭据读取失败' } }
const tokenMigrationError = ref('')
const load = async (force = false) => {
 const current = ++version; loading.value = true; loadError.value = ''
 try {
  if (activeTab.value === 'github') {
   tokenMigrationError.value = ''
   try { const migration = await api.post<{migrated:number;conflicts:Array<{name:string}>}>('/api/resources/credentials/migrate', {}); if (migration.migrated) invalidateData('/api/resources/accounts'); if (migration.conflicts?.length) tokenMigrationError.value = `旧备注 Token 与默认 Token 不同，已保留默认值，请在账号编辑中填写要使用的 Token：${migration.conflicts.map(item=>item.name).join('、')}` }
   catch(e) { tokenMigrationError.value = e instanceof Error ? e.message : '旧 Token 迁移失败' }
  }
  const data = await Promise.all([cachedGet<ProviderAccount[]>('/api/resources/accounts', force), cachedGet<ProviderResource[]>('/api/resources', force), cachedGet<typeof websites.value>('/api/websites', force), cachedGet<Link[]>('/api/resources/links', force), cachedGet<AccountLink[]>('/api/resources/account-links', force)]); if (current !== version) return; [accounts.value, resources.value, websites.value, links.value, accountLinks.value] = data; await loadCredentials() }
 catch (e) { if (current === version) loadError.value = e instanceof Error ? e.message : '资源数据加载失败' }
 finally { if (current === version) loading.value = false }
}
watch(() => route.fullPath, () => { editor.value = ''; baseline.value = ''; clearSecrets(); credentialVersion++; void load() }, { immediate: true })
onUnmounted(() => { disposed = true; version++; credentialVersion++; clearSecrets() })
const refresh = async () => { if (await canDiscard()) { editor.value = ''; clearRevealed(); await load(true) } }
const changeProvider = (value: string | number) => { void router.push({ name: 'Resources', query: { provider: String(value) } }) }
const selectAccount = (account: ProviderAccount) => { void router.push({ query: { provider: account.provider, account: String(account.id) } }) }
const selectResource = (resource: ProviderResource) => { void router.push({ query: { provider: resource.provider, ...(resource.account_id ? { account: String(resource.account_id) } : {}), resource: String(resource.id) } }) }
const showSites = (key: string, id?: number) => { void router.push({ name: 'Home', query: { [key]: String(id) } }) }
const openSite = (id: number) => { void router.push({ name: 'Home', query: websiteQuery(id, 'deployment') }) }
const siteName = (id: number) => websites.value.find(item => item.id === id)?.name || `网站 #${id}`
const openAccountForm = async () => { if (!(await canDiscard())) return; editingAccount.value = undefined; accountForm.value = { provider: activeTab.value, provider_name: activeTab.value==='github'?'GitHub':activeTab.value==='cloudflare'?'Cloudflare':'', github_username:'', name: '', login_email: '', memo: '', token: '' }; markEditor('account') }
const editAccount = async (account: ProviderAccount) => { if (!(await canDiscard())) return; editingAccount.value = account.id; accountForm.value = { provider: account.provider, provider_name:account.provider_name, github_username:account.github_username, name: account.name, login_email: account.login_email, status: account.status, memo: account.memo, token: '' }; markEditor('account') }
const openResourceForm = async () => { if (!(await canDiscard())) return; editingResourceId.value = undefined; resourceForm.value = { provider: activeTab.value, account_id: activeTab.value === 'vps' ? 0 : selectedAccount.value?.id, name: '', resource_url: '', identifier: '', ip_address: '', port: undefined, region: '', memo: '' }; markEditor('resource') }
const openResourceFormFor = async (account: ProviderAccount) => { if (!(await canDiscard())) return; await router.push({ name: 'Resources', query: { provider: account.provider, account: String(account.id) } }); editingResourceId.value = undefined; resourceForm.value = { provider: account.provider, account_id: account.id, name: '', resource_url: '', identifier: '', ip_address: '', port: undefined, region: '', memo: '' }; markEditor('resource') }
const editResource = async (resource: ProviderResource) => { if (!(await canDiscard())) return; editingResourceId.value = resource.id; resourceForm.value = { ...resource, account_id: resource.account_id ?? 0, port: resource.port ?? undefined, expires_at:resource.expires_at || '' }; markEditor('resource') }
const openLinkForm = async (resource: ProviderResource) => { if (!(await canDiscard())) return; linkResource.value = resource; linkAccount.value = undefined; linkForm.value = { website_id: undefined, role: resource.provider === 'github' ? '代码仓库' : resource.provider === 'cloudflare' ? '' : '托管', is_primary: false }; markEditor('link') }
const openCredential = async () => { if (!(await canDiscard())) return; editingCredentialId.value = undefined; credentialForm.value = { label: '', token: '', expires_at: '', is_default:false }; clearRevealed(); markEditor('credential') }
const editCredential = async (item: ProviderCredential) => { if (!(await canDiscard())) return; editingCredentialId.value = item.id; credentialForm.value = { label: item.label, token: '', expires_at: item.expires_at || '', is_default:Boolean(item.is_default) }; clearRevealed(); markEditor('credential') }
const submit = async (action: () => Promise<void>) => { if (saving.value) return; saving.value = true; try { await action() } catch (e) { ElMessage.error(e instanceof Error ? e.message : '保存失败') } finally { saving.value = false } }
const updateResourceData = async (affectsLinks = false) => { invalidateData('/api/websites', '/api/resources/accounts', '/api/resources', '/api/resources/account-links', ...(affectsLinks ? ['/api/resources/links'] : [])); await load() }
const saveAccount = () => submit(async () => { const id = editingAccount.value; await (id ? api.put(`/api/resources/accounts/${id}`, accountForm.value) : api.post('/api/resources/accounts', accountForm.value)); accountForm.value.token = ''; editor.value = ''; baseline.value = ''; await updateResourceData(); ElMessage.success('账号已保存') })
const saveResource = () => submit(async () => { const payload = { ...resourceForm.value, account_id: resourceForm.value.account_id || null }; const id = editingResourceId.value; await (id ? api.put(`/api/resources/resources/${id}`, payload) : api.post('/api/resources', payload)); editor.value = ''; await updateResourceData(); ElMessage.success('资源已保存') })
const openAccountLink = async () => { if (!(await canDiscard()) || !selectedAccount.value?.id) return; linkResource.value = undefined; linkAccount.value = selectedAccount.value.id; linkForm.value = { website_id: undefined, role: '', is_primary: false }; markEditor('link') }
const saveLink = () => submit(async () => { if (!linkForm.value.website_id) throw new Error('请选择网站'); if (linkResource.value?.id) { await api.post('/api/resources/links', { ...linkForm.value, resource_id: linkResource.value.id }) } else if (linkAccount.value) { await api.post('/api/resources/account-links', { website_id: linkForm.value.website_id, account_id: linkAccount.value }) } else throw new Error('请选择资源或账号'); editor.value = ''; await updateResourceData(true); ElMessage.success('关联已保存') })
const unlinkAccount = async (id: number) => { if (saving.value || !(await canDiscard())) return; await submit(async () => { await api.delete(`/api/resources/account-links?id=${id}`); editor.value = ''; await updateResourceData(true) }) }

const disableAccount = async (account: ProviderAccount) => { if (saving.value || !(await canDiscard())) return; try { await confirmAction(`停用“${account.name}”？关联记录会保留。`, '停用账号', { confirmButtonText: '停用' }); await submit(async () => { await api.post(`/api/resources/accounts/${account.id}`); editor.value = ''; await updateResourceData() }) } catch (e) { if (!isDismissed(e)) ElMessage.error('停用失败') } }
const disableResource = async (resource: ProviderResource) => { if (saving.value || !(await canDiscard())) return; try { await confirmAction(`停用“${resource.name}”？网站关联不会删除。`, '停用资源', { confirmButtonText: '停用' }); await submit(async () => { await api.post(`/api/resources/resources/${resource.id}`); editor.value = ''; await updateResourceData() }) } catch (e) { if (!isDismissed(e)) ElMessage.error('停用失败') } }
const unlink = async (link: Link) => { if (saving.value || !(await canDiscard())) return; try { await confirmAction(`解除“${siteName(link.website_id)}”与“${selectedResource.value?.name}”的关联？`, '解除关联', { confirmButtonText: '解除' }); await submit(async () => { await api.delete(`/api/resources/links?id=${link.id}`); editor.value = ''; await updateResourceData(true) }) } catch (e) { if (!isDismissed(e)) ElMessage.error('解除失败') } }
const saveCredential = () => submit(async () => { if (!selectedAccount.value?.id) throw new Error('请选择账号'); if (!credentialForm.value.label.trim() || (!editingCredentialId.value && !credentialForm.value.token.trim())) throw new Error('请填写凭据名称和 Token'); const id = editingCredentialId.value; const payload = { account_id: selectedAccount.value.id, ...credentialForm.value }; await (id ? api.put(`/api/resources/credentials/${id}`, payload) : api.post('/api/resources/credentials', payload)); editor.value = ''; credentialForm.value.token = ''; clearRevealed(); await loadCredentials(); ElMessage.success('Token 已保存') })
const deleteCredential = async (item: ProviderCredential) => { if (saving.value) return; try { await confirmAction(`删除“${selectedAccount.value?.name}”的凭据“${item.label}”？`, '删除凭据', { confirmButtonText: '删除' }); await submit(async () => { await api.delete(`/api/resources/credentials/${item.id}`); clearRevealed(); await loadCredentials() }) } catch (e) { if (!isDismissed(e)) ElMessage.error('删除失败') } }
const revealCredential = (id?: number) => submit(async () => { clearRevealed(); const requestVersion = revealVersion; const account = selectedAccount.value?.id; const context = route.fullPath; const result = await api.post<{ token: string }>(`/api/resources/credentials/${id}`); if (disposed || requestVersion !== revealVersion || account !== selectedAccount.value?.id || context !== route.fullPath) return; revealedToken.value = result.token; revealedLabel.value = credentials.value.find(item => item.id === id)?.label || '' })
const copyCredential = async () => { try { await copyText(revealedToken.value); ElMessage.success('Token 已复制') } catch { ElMessage.error('Token 复制失败，请手动复制') } }
</script>
