<template>
  <el-dialog :model-value="visible" title="批量设置网站" width="min(720px,94vw)" :before-close="close" :close-on-press-escape="!saving" @update:model-value="emit('update:visible',$event)" destroy-on-close>
    <p>将更新已选的 {{ websites.length }} 个网站。只保存已填写的项目；服务账号会追加关联。</p>
    <details><summary>查看已选网站</summary><ul class="bulk-settings-targets"><li v-for="site in websites" :key="site.id">{{ site.domains.find(domain=>domain.is_primary)?.domain || site.name }}</li></ul></details>
    <div v-if="loadError || saveError" class="page-error" role="alert">{{ loadError || saveError }}<el-button v-if="loadError" @click="loadOptions">重试读取账号</el-button></div>
    <el-form label-position="top" :disabled="saving || loading || Boolean(loadError)" class="page-form-grid bulk-settings-form" @submit.prevent="save">
      <el-form-item label="关联服务账号" class="page-form-full">
        <el-select v-model="accountIds" multiple :multiple-limit="20" filterable clearable placeholder="选择部署与账号中的已有账号" aria-label="批量关联服务账号">
          <el-option-group v-for="provider in providers" :key="provider.value" :label="provider.label">
            <el-option v-for="account in accounts.filter(item=>item.provider===provider.value)" :key="account.id" :label="accountLabel(account)" :value="account.id!" />
          </el-option-group>
        </el-select>
      </el-form-item>
      <el-form-item label="主要管理电脑"><el-select v-model="computer" filterable allow-create default-first-option clearable placeholder="不修改" aria-label="批量设置电脑" @clear="computer=undefined"><el-option label="清空电脑" :value="0" /><el-option v-for="name in computers" :key="name" :label="name" :value="name" /></el-select></el-form-item>
      <el-form-item label="GSC 账号"><el-select v-model="gscAccountId" filterable clearable placeholder="不修改" aria-label="批量设置GSC账号" @clear="gscAccountId=undefined"><el-option label="解除 GSC 账号关联" :value="0" /><el-option v-for="account in gscAccounts" :key="account.id" :label="account.name+(account.email?' · '+account.email:'')" :value="account.id" /></el-select></el-form-item>
      <el-form-item v-for="field in editableFields" :key="field.key" :label="field.label"><el-select v-model="fields[field.key]" clearable placeholder="不修改" :aria-label="'批量设置'+field.label"><el-option v-for="value in field.values" :key="value" :label="value" :value="value" /></el-select></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="close(()=>emit('update:visible',false))">取消</el-button><el-button type="primary" :loading="saving" :disabled="!changed || loading || Boolean(loadError) || !websites.length" @click="save">保存批量设置</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onDeactivated, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ProviderAccount } from '../../functions/types'
import { bulkUpdateWebsites, type Website, type WebsiteBulkRelations } from '../api/websites'
import { getGscAccounts, type GscAccount } from '../api/website-management'
import { cachedGet } from '../utils/workspaceCache'
import { sortComputerNames } from '../utils/computer-options'
import { confirmDiscard, useUnsavedChanges } from '../composables/useUnsavedChanges'
const props=defineProps<{visible:boolean;websites:Website[];computerNames:string[]}>()
const emit=defineEmits<{'update:visible':[value:boolean];saved:[count:number]}>()
const providers=[{value:'cloudflare',label:'Cloudflare'},{value:'github',label:'GitHub'},{value:'vhost',label:'虚拟主机'},{value:'vps',label:'VPS'}]
const editableFields=[{key:'ownership',label:'网站归属',values:['自营网站','企业客户网站','未分类']},{key:'platform',label:'技术栈',values:['WordPress','Astro','Next.js','其他']},{key:'stage',label:'阶段',values:['待评估','验证','增长','维护','暂停']},{key:'industry',label:'网站类型',values:['计算器','资讯站','其他']}]
const accounts=ref<ProviderAccount[]>([]),gscAccounts=ref<GscAccount[]>([]),accountIds=ref<number[]>([]),gscAccountId=ref<number>(),computer=ref<string|number>()
const fields=reactive<Record<string,string|undefined>>({}),loading=ref(false),saving=ref(false),loadError=ref(''),saveError=ref('')
let loadVersion=0
const computers=computed(()=>sortComputerNames(props.computerNames))
const updates=computed(()=>{
  const result:Record<string,unknown>=Object.fromEntries(Object.entries(fields).filter(([,value])=>value!==undefined && value!==''))
  if(computer.value!==undefined && computer.value!=='')result.computer_name=computer.value===0?null:computer.value
  return result
})
const changed=computed(()=>Object.keys(updates.value).length>0 || accountIds.value.length>0 || gscAccountId.value!==undefined)
const dirty=computed(()=>props.visible && changed.value)
useUnsavedChanges(dirty,{blocked:computed(()=>props.visible && saving.value)})
const accountLabel=(account:ProviderAccount)=>`${providers.find(item=>item.value===account.provider)?.label} · ${account.name}${account.login_email && account.login_email.toLowerCase()!==account.name.toLowerCase()?' · '+account.login_email:''}`
const reset=()=>{for(const key of Object.keys(fields))delete fields[key];accountIds.value=[];gscAccountId.value=undefined;computer.value=undefined;loadError.value='';saveError.value=''}
const loadOptions=async()=>{
  const version=++loadVersion;loading.value=true;loadError.value=''
  try{const [service,gsc]=await Promise.all([cachedGet<ProviderAccount[]>('/api/resources/accounts',true),getGscAccounts(true)]);if(version===loadVersion){accounts.value=service.filter(account=>account.id && account.status!=='停用');gscAccounts.value=gsc}}
  catch(error){if(version===loadVersion)loadError.value=error instanceof Error?error.message:'账号读取失败'}
  finally{if(version===loadVersion)loading.value=false}
}
const save=async()=>{
  if(saving.value || loading.value || loadError.value || !changed.value || !props.websites.length)return
  saving.value=true;saveError.value=''
  try{
    const relations:WebsiteBulkRelations={}
    if(accountIds.value.length)relations.account_ids=[...accountIds.value]
    if(gscAccountId.value!==undefined)relations.gsc_account_id=gscAccountId.value===0?null:gscAccountId.value
    const result=await bulkUpdateWebsites(props.websites.map(site=>site.id),updates.value,relations)
    reset();emit('update:visible',false);emit('saved',result.accepted);ElMessage.success(`已更新 ${result.accepted} 个网站`)
  }catch(error){saveError.value=error instanceof Error?error.message:'批量设置失败，请重试'}finally{saving.value=false}
}
const close=async(done:()=>void)=>{if(!saving.value && await confirmDiscard(dirty.value))done()}
onDeactivated(()=>emit('update:visible',false))
watch(()=>props.visible,value=>{if(value){reset();void loadOptions()}else loadVersion++})
</script>
<style scoped src="../styles/dialogs/website-bulk-settings.css"></style>
