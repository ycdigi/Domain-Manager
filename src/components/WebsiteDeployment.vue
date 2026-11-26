<template>
  <section class="portfolio-detail-section">
    <div class="portfolio-detail-heading">
      <h2>部署与账号</h2>
      <router-link :to="{ name: 'Resources' }">管理账号与资源</router-link>
    </div>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load">重试</el-button></div>
    <div v-if="cloudflareMissing" class="page-muted">Cloudflare 托管尚未关联主要 GitHub 仓库，可在下方补充。</div>
    <WebsiteMaintenanceForm ref="maintenancePanel" :website="website" @changed="emit('changed')" />
    <h3>关联账号</h3><p class="page-muted">账号归属不代表托管位置；请在下方关联实际主机、项目或仓库。</p>
    <ul class="page-list"><li v-for="link in accountLinks" :key="link.id"><ProviderIdentity :provider="link.provider" :provider-name="link.provider_name" :name="link.account_name" /><el-button text :disabled="saving" @click="unlinkAccount(link.id)">解除账号关联</el-button></li></ul>
    <el-form label-position="top" @submit.prevent="saveAccount">
      <el-form-item label="服务账号">
        <el-select v-model="accountForm.account_id" clearable filterable placeholder="选择平台账号">
          <template #label><ProviderIdentity v-if="selectedAccount" :provider="selectedAccount.provider" :provider-name="selectedAccount.provider_name" :name="selectedAccount.name" /></template>
          <el-option v-for="account in accounts.filter(a => a.status !== '停用')" :key="account.id" :label="accountLabel(account)" :value="account.id!">
            <ProviderIdentity :provider="account.provider" :provider-name="account.provider_name" :name="account.name" />
          </el-option>
        </el-select>
      </el-form-item>
      <el-button :loading="saving" native-type="submit">关联账号</el-button>
    </el-form>
    <div v-for="role in roles" :key="role" class="deployment-role">
      <strong>{{ role }}</strong>
      <ul class="page-list">
        <li v-for="link in links.filter((l) => l.role === role)" :key="link.id">
          <div>
            <span>{{ link.resource_name }}</span
            ><small class="page-muted">
              · {{ link.account_name || '未关联账号' }}{{ link.ip_address ? ' · ' + link.ip_address : ''
              }}{{ link.is_primary ? ' · 主要' : '' }}</small
            >
            <p v-if="link.resource_url">
              <a :href="safeUrl(link.resource_url)" target="_blank" rel="noopener noreferrer">{{
                link.resource_url
              }}</a>
            </p>
          </div>
          <div class="page-actions">
            <el-button v-if="!link.is_primary" text :disabled="saving" @click="makePrimary(link)">设为主要</el-button
            ><el-button text :disabled="saving" @click="unlink(link)">解除</el-button>
          </div>
        </li>
      </ul>
      <p v-if="!links.some((l) => l.role === role)" class="page-muted">—</p>
    </div>
    <el-form label-position="top" @submit.prevent="save"
      ><div class="portfolio-detail-grid">
        <el-form-item label="用途"
          ><el-select v-model="form.role"
            ><el-option v-for="role in roles" :key="role" :value="role" /></el-select></el-form-item
        ><el-form-item label="资源"
          ><el-select v-model="form.resource_id" filterable clearable placeholder="选择已有资源"
            ><el-option
              v-for="resource in availableResources"
              :key="resource.id"
              :value="resource.id!"
              :label="resource.name" /></el-select></el-form-item
        ><el-form-item label="该用途的主要资源"><el-switch v-model="form.is_primary" /></el-form-item>
      </div>
      <el-button type="primary" native-type="submit" :loading="saving">关联资源</el-button></el-form
    >
  </section>
</template>
<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import WebsiteMaintenanceForm from './WebsiteMaintenanceForm.vue'
import ProviderIdentity from './ProviderIdentity.vue'
import { providerIdentity } from '../utils/provider-identity'
import { api } from '../utils/request'
import { invalidateData } from '../utils/workspaceCache'
import type { Website } from '../api/websites'
import { resourceRoles, resourceSupportsRole } from '../../shared/resource-roles'
import type { ProviderAccount, ProviderResource } from '../../functions/types'
const props = defineProps<{ website: Website }>()
const emit = defineEmits<{ changed: [] }>()
type Link = {
  id: number
  resource_id: number
  role: string
  is_primary: number
  resource_name: string
  account_name?: string
  resource_url?: string
  ip_address?: string
  provider: string
}
const roles = resourceRoles
const accounts = ref<ProviderAccount[]>([])
const accountLinks = ref<Array<{ id:number; account_name:string; provider:string; provider_name?:string }>>([])
const accountForm = reactive({ account_id:undefined as number | undefined })
const selectedAccount = computed(() => accounts.value.find(account => account.id === accountForm.account_id))
const accountLabel = (account: ProviderAccount) => { const identity = providerIdentity(account.provider, account.provider_name, account.name); return identity.label + (identity.accountName ? ` · ${identity.accountName}` : '') }
const links = ref<Link[]>([])
const resources = ref<ProviderResource[]>([])
const maintenancePanel = ref<InstanceType<typeof WebsiteMaintenanceForm>>()
const saving = ref(false)
const error = ref('')
const form = reactive({ resource_id: undefined as number | undefined, role: '托管', is_primary: true })
const baseline = ref(JSON.stringify({ form, accountForm }))
const dirty = computed(() => JSON.stringify({ form, accountForm }) !== baseline.value || !!maintenancePanel.value?.dirty)
defineExpose({ dirty, busy: computed(() => saving.value || !!maintenancePanel.value?.busy) })
const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined)
const availableResources = computed(() =>
  resources.value.filter(
    (r) =>
      r.status !== '停用' && (r.account_id == null || accounts.value.some(account => account.id === r.account_id && account.status !== '停用')) &&
      resourceSupportsRole(r.provider, form.role)
  )
)
const cloudflareMissing = computed(
  () =>
    links.value.some((l) => l.provider === 'cloudflare' && l.role === '托管' && l.is_primary) &&
    !links.value.some((l) => l.role === '代码仓库' && l.is_primary)
)
const load = async () => {
  error.value = ''
  try {
    ;[links.value, resources.value, accounts.value, accountLinks.value] = await Promise.all([
      api.get<Link[]>(`/api/resources/links?website_id=${props.website.id}`),
      api.get<ProviderResource[]>('/api/resources'),
      api.get<ProviderAccount[]>('/api/resources/accounts'),
      api.get<typeof accountLinks.value>(`/api/resources/account-links?website_id=${props.website.id}`)
    ])
  } catch (e) {
    error.value = e instanceof Error ? e.message : '资源读取失败'
  }
}
const write = async (action: () => Promise<unknown>) => {
  if (saving.value) return
  saving.value = true
  try {
    await action()
    invalidateData('/api/websites', '/api/resources/links', '/api/resources/account-links', '/api/resources/accounts', '/api/resources')
    await load()
    emit('changed')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '关联更新失败')
  } finally {
    saving.value = false
  }
}
const save = () =>
  write(async () => {
    if (!form.resource_id) throw new Error('请选择资源')
    await api.post('/api/resources/links', { website_id: props.website.id, ...form })
    baseline.value = JSON.stringify({ form, accountForm })
  })
const saveAccount = () => write(async () => { if (!accountForm.account_id) throw new Error('请选择账号'); await api.post('/api/resources/account-links', { website_id:props.website.id, account_id:accountForm.account_id }); accountForm.account_id = undefined; baseline.value = JSON.stringify({ form, accountForm }) })
const unlinkAccount = (id:number) => write(() => api.delete(`/api/resources/account-links?id=${id}`))
const makePrimary = (link: Link) =>
  write(() =>
    api.post('/api/resources/links', {
      website_id: props.website.id,
      resource_id: link.resource_id,
      role: link.role,
      is_primary: true
    })
  )
const unlink = (link: Link) => write(() => api.delete(`/api/resources/links?id=${link.id}`))
onMounted(load)
</script>
<style scoped src="../styles/dialogs/website-deployment.css"></style>
