<template>
  <el-dialog :model-value="visible" title="批量设置网站" width="min(720px,94vw)" :before-close="close" :close-on-press-escape="!saving" @update:model-value="emit('update:visible',$event)" destroy-on-close>
    <p>将更新已选的 {{ websites.length }} 个网站。空白项目保留原值，所选设置对全部已选网站生效。</p>
    <details><summary>查看已选网站</summary><ul class="bulk-settings-targets"><li v-for="site in websites" :key="site.id">{{ site.domains.find(domain=>domain.is_primary)?.domain || site.name }}</li></ul></details>
    <div v-if="loadError || saveError" class="page-error" role="alert">{{ loadError || saveError }}<el-button v-if="loadError" @click="loadOptions">重试读取账号</el-button></div>
    <el-form label-position="top" :disabled="saving || loading || Boolean(loadError)" class="page-form-grid bulk-settings-form" @submit.prevent="save">
      <el-form-item label="服务商 / GitHub 账号" class="page-form-full">
        <el-radio-group v-model="accountMode" aria-label="批量账号操作"><el-radio value="add">追加关联</el-radio><el-radio value="remove">解除所选账号关联</el-radio></el-radio-group>
        <el-select v-model="accountIds" multiple :multiple-limit="20" filterable clearable placeholder="选择部署与账号中的已有账号" aria-label="批量关联服务账号">
          <el-option-group v-for="provider in providers" :key="provider.value" :label="provider.label">
            <el-option v-for="account in accounts.filter(item=>item.provider===provider.value && (accountMode==='remove' || item.status!=='停用'))" :key="account.id" :label="accountLabel(account)" :value="account.id!" />
          </el-option-group>
        </el-select>
        <small class="page-muted">解除仅移除直接账号关联；实际主机或仓库所属账号请在下方解除对应资源。</small>
      </el-form-item>
      <el-form-item v-for="role in resourceRoles" :key="role" :label="role==='托管'?'托管主机 / IP':role+'资源'">
        <el-select v-model="resourceIds[role]" clearable filterable placeholder="不修改" :aria-label="'批量设置'+role+'资源'">
          <el-option :label="'解除全部'+role+'资源关联'" :value="0" />
          <el-option v-for="resource in availableResources(role)" :key="resource.id" :label="resourceLabel(resource)" :value="resource.id!" />
        </el-select>
        <small v-if="role==='托管'" class="page-muted">选择已有主机或项目同步显示服务商和 IP；不会修改主机本身或其他网站。</small>
        <small v-if="role==='代码仓库'" class="page-muted">全部已选网站将使用同一主要仓库；各站仓库不同请仅关联 GitHub 账号。</small>
      </el-form-item>
      <el-form-item label="加入已有批次" class="page-form-full"><el-select v-model="batchIds" multiple :multiple-limit="20" filterable clearable placeholder="保留原有批次，追加所选批次" aria-label="批量加入已有批次"><el-option v-for="batch in batches.filter(item=>item.status!=='已归档')" :key="batch.id" :label="batch.name" :value="batch.id" /></el-select></el-form-item>
      <el-form-item label="主要管理电脑"><el-select v-model="computer" filterable allow-create default-first-option clearable placeholder="不修改" aria-label="批量设置电脑" @clear="computer=undefined"><template #label="{ label }"><ComputerIdentity v-if="typeof computer === 'string'" :name="computer" /><span v-else>{{ label }}</span></template><el-option label="清空电脑" :value="0" /><el-option v-for="name in computers" :key="name" :label="name" :value="name"><ComputerIdentity :name="name" /></el-option></el-select></el-form-item>
      <el-form-item label="GSC 账号"><el-select v-model="gscAccountId" filterable clearable placeholder="不修改" aria-label="批量设置GSC账号" @clear="gscAccountId=undefined"><el-option label="解除 GSC 账号关联" :value="0" /><el-option v-for="account in gscAccounts" :key="account.id" :label="account.name+(account.email?' · '+account.email:'')" :value="account.id" /></el-select></el-form-item>
      <el-form-item label="AdSense 账号"><el-select v-model="adsenseAccountId" clearable filterable placeholder="不修改" aria-label="批量设置AdSense账号" @clear="adsenseAccountId=undefined"><el-option label="解除 AdSense 账号关联" :value="0" /><el-option v-for="account in adsenseAccounts" :key="account.id" :label="account.name" :value="account.id" /></el-select></el-form-item>
      <el-form-item label="新站分类"><el-select v-model="newSite" clearable placeholder="不修改" aria-label="批量设置新站分类"><el-option label="自动按域名注册日期判断" value="auto" /><el-option label="新站" value="new" /><el-option label="普通站" value="regular" /></el-select></el-form-item>
      <el-form-item v-for="field in editableFields" :key="field.key" :label="field.label"><el-select v-model="fields[field.key]" clearable placeholder="不修改" :aria-label="'批量设置'+field.label"><el-option v-for="value in field.values" :key="value" :label="value" :value="value" /></el-select></el-form-item>
      <el-form-item v-if="fields.platform==='其他'" label="自定义技术栈"><el-input v-model="platformOther" maxlength="100" placeholder="可选" aria-label="批量自定义技术栈" /></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="close(()=>emit('update:visible',false))">取消</el-button><el-button type="primary" :loading="saving" :disabled="!changed || loading || Boolean(loadError) || !websites.length" @click="save">保存批量设置</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { websiteStages } from '../../shared/website-classification'
import { computed, onDeactivated, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ProviderAccount, ProviderResource } from '../../functions/types'
import { resourceRoles, resourceSupportsRole } from '../../shared/resource-roles'
import { getBatches, type Batch } from '../api/batches'
import { bulkUpdateWebsites, type Website, type WebsiteBulkRelations } from '../api/websites'
import { getGscAccounts, type GscAccount } from '../api/website-management'
import { cachedGet } from '../utils/workspaceCache'
import ComputerIdentity from './ComputerIdentity.vue'
import { sortComputerNames } from '../utils/computer-options'
import { confirmDiscard, useUnsavedChanges } from '../composables/useUnsavedChanges'
const props=defineProps<{visible:boolean;websites:Website[];computerNames:string[]}>()
const emit=defineEmits<{'update:visible':[value:boolean];saved:[count:number]}>()
const providers=[{value:'cloudflare',label:'Cloudflare'},{value:'github',label:'GitHub'},{value:'vhost',label:'虚拟主机'},{value:'vps',label:'VPS'}]
const editableFields=[{key:'ownership',label:'网站归属',values:['自营网站','企业客户网站','未分类']},{key:'platform',label:'技术栈',values:['WordPress','Astro','Next.js','其他']},{key:'stage',label:'阶段',values:websiteStages},{key:'industry',label:'网站类型',values:['计算器','资讯站','其他']},{key:'adsense_connected',label:'AdSense 开通状态',values:['未知','已开通','未开通']},{key:'gsc_connected',label:'GSC 开通状态',values:['未知','已开通','未开通']}]
const accounts=ref<ProviderAccount[]>([]),gscAccounts=ref<GscAccount[]>([]),accountIds=ref<number[]>([]),gscAccountId=ref<number>(),computer=ref<string|number>()
const accountMode=ref('add'),resources=ref<ProviderResource[]>([]),resourceIds=reactive<Record<string,number|undefined>>({}),batches=ref<Batch[]>([]),batchIds=ref<number[]>([])
const adsenseAccounts=ref<Array<{id:number;name:string;status:string}>>([]),adsenseAccountId=ref<number>(),newSite=ref<string>(),platformOther=ref('')
const fields=reactive<Record<string,string|undefined>>({}),loading=ref(false),saving=ref(false),loadError=ref(''),saveError=ref('')
let loadVersion=0
const computers=computed(()=>sortComputerNames(props.computerNames))
const updates=computed(()=>{
  const result:Record<string,unknown>=Object.fromEntries(Object.entries(fields).filter(([,value])=>value!==undefined && value!==''))
  if(computer.value!==undefined && computer.value!=='')result.computer_name=computer.value===0?null:computer.value
  if(adsenseAccountId.value!==undefined)result.adsense_account_id=adsenseAccountId.value===0?null:adsenseAccountId.value
  if(newSite.value)result.new_site_override=newSite.value==='auto'?null:newSite.value==='new'?1:0
  if(fields.platform==='其他')result.platform_other=platformOther.value.trim() || null
  return result
})
const resourceAssignments=computed(()=>Object.entries(resourceIds).filter(([,id])=>typeof id==='number').map(([role,id])=>({role,resource_id:id===0?null:id!})))
const changed=computed(()=>Object.keys(updates.value).length>0 || accountIds.value.length>0 || gscAccountId.value!==undefined || resourceAssignments.value.length>0 || batchIds.value.length>0)
const dirty=computed(()=>props.visible && changed.value)
useUnsavedChanges(dirty,{blocked:computed(()=>props.visible && saving.value)})
const accountLabel=(account:ProviderAccount)=>`${providers.find(item=>item.value===account.provider)?.label} · ${account.name}${account.login_email && account.login_email.toLowerCase()!==account.name.toLowerCase()?' · '+account.login_email:''}`
const availableResources=(role:string)=>resources.value.filter(resource=>resource.status!=='停用' && resourceSupportsRole(resource.provider,role) && (resource.account_id==null || accounts.value.some(account=>account.id===resource.account_id && account.status!=='停用')))
const resourceLabel=(resource:ProviderResource)=>[resource.account_name,resource.name,resource.ip_address,resource.resource_url].filter(Boolean).join(' · ')
const reset=()=>{for(const key of Object.keys(fields))delete fields[key];for(const key of Object.keys(resourceIds))delete resourceIds[key];accountMode.value='add';accountIds.value=[];batchIds.value=[];adsenseAccountId.value=undefined;newSite.value=undefined;platformOther.value='';gscAccountId.value=undefined;computer.value=undefined;loadError.value='';saveError.value=''}
const loadOptions=async()=>{
  const version=++loadVersion;loading.value=true;loadError.value=''
  try{const [service,gsc,items,batchOptions,adsense]=await Promise.all([cachedGet<ProviderAccount[]>('/api/resources/accounts',true),getGscAccounts(true),cachedGet<ProviderResource[]>('/api/resources',true),getBatches(true),cachedGet<typeof adsenseAccounts.value>('/api/adsense/accounts',true)]);if(version===loadVersion){accounts.value=service.filter(account=>account.id);gscAccounts.value=gsc;resources.value=items;batches.value=batchOptions;adsenseAccounts.value=adsense.filter(account=>account.status!=='停用')}}
  catch(error){if(version===loadVersion)loadError.value=error instanceof Error?error.message:'账号读取失败'}
  finally{if(version===loadVersion)loading.value=false}
}
const save=async()=>{
  if(saving.value || loading.value || loadError.value || !changed.value || !props.websites.length)return
  saving.value=true;saveError.value=''
  try{
    const relations:WebsiteBulkRelations={}
    if(accountIds.value.length)relations[accountMode.value==='remove'?'remove_account_ids':'account_ids']=[...accountIds.value]
    if(gscAccountId.value!==undefined)relations.gsc_account_id=gscAccountId.value===0?null:gscAccountId.value
    if(resourceAssignments.value.length)relations.resource_assignments=resourceAssignments.value
    if(batchIds.value.length)relations.batch_ids=[...batchIds.value]
    const result=await bulkUpdateWebsites(props.websites.map(site=>site.id),updates.value,relations)
    reset();emit('update:visible',false);emit('saved',result.accepted);ElMessage.success(`已更新 ${result.accepted} 个网站`)
  }catch(error){saveError.value=error instanceof Error?error.message:'批量设置失败，请重试'}finally{saving.value=false}
}
const close=async(done:()=>void)=>{if(!saving.value && await confirmDiscard(dirty.value))done()}
watch(accountMode,()=>{accountIds.value=[]})
onDeactivated(()=>emit('update:visible',false))
watch(()=>props.visible,value=>{if(value){reset();void loadOptions()}else loadVersion++})
</script>
<style scoped src="../styles/dialogs/website-bulk-settings.css"></style>
