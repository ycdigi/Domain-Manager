<template>
  <div class="workspace-page">
    <WorkspaceHeading title="网站管理" subtitle="工作登记、最近调整与 GSC 账号归属">
      <el-button :disabled="busy.size>0 || historyBusy" :loading="loading" @click="load(true)">刷新</el-button><el-button @click="openAccounts">管理 GSC 账号</el-button>
    </WorkspaceHeading>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <div v-if="notice" class="management-notice" role="status"><span>{{ notice.domain }} · {{ notice.record.kind }}已记录</span><el-button text :loading="undoing" @click="undoLast">撤销本次</el-button><el-button text aria-label="关闭记录提示" @click="notice=undefined">关闭</el-button></div>
    <div class="management-filters">
      <el-input :model-value="query('q')" clearable placeholder="搜索网站或域名" aria-label="搜索网站或域名" @update:model-value="value=>filter('q',value)" />
      <el-select :model-value="query('view')" clearable placeholder="全部网站" aria-label="网站状态筛选" @change="value=>filter('view',value)"><el-option label="全部网站" value="all" /><el-option label="经营中" value="active" /><el-option label="停止经营" value="stopped" /></el-select>
      <el-select :model-value="query('batch')" clearable filterable placeholder="全部批次" aria-label="网站批次筛选" @change="value=>filter('batch',value)"><el-option label="全部批次" value="" /><el-option v-for="batch in batches" :key="batch.id" :label="batch.name" :value="String(batch.id)" /></el-select>
      <el-select v-for="(kind,index) in workKinds" :key="kind" :model-value="query('work'+index)" clearable :placeholder="kind+' · 全部'" :aria-label="`${kind}筛选`" @change="value=>filter('work'+index,value)"><el-option :label="kind+' · 全部'" value="" /><el-option :label="kind+' · 否'" value="no" /><el-option :label="kind+' · 是'" value="yes" /></el-select>
      <el-select :model-value="query('gsc')" clearable placeholder="全部 GSC 账号" aria-label="GSC 账号筛选" @change="value=>filter('gsc',value)"><el-option label="全部 GSC 账号" value="" /><el-option label="未关联" value="none" /><el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="String(account.id)" /></el-select>
      <el-select :model-value="query('sort')" clearable placeholder="默认顺序" aria-label="记录排序" @change="value=>filter('sort',value)"><el-option label="默认顺序" value="" /><el-option label="最近登记优先" value="recent" /><el-option label="最久未登记优先" value="oldest" /></el-select>
    </div>
    <div class="management-results"><span role="status">{{ visibleRows.length }} / {{ rows.length }} 个网站</span><el-button v-if="hasFilters" text @click="clearFilters">清除全部条件</el-button></div>
    <div class="management-table-wrap" role="region" aria-label="网站工作记录，可横向滚动" tabindex="0" :aria-busy="loading">
      <table class="management-table" aria-label="网站管理工作登记与 GSC 归属"><colgroup><col class="management-domain-column" /><col v-for="kind in workKinds" :key="kind" class="management-work-column" /><col class="management-gsc-column" /></colgroup>
        <thead><tr><th scope="col">网站域名</th><th v-for="kind in workKinds" :key="kind" scope="col">{{ kind }}</th><th scope="col">GSC归属</th></tr></thead>
        <tbody><tr v-for="row in visibleRows" :key="row.id" :data-website-id="row.id">
          <th scope="row"><el-tooltip popper-class="management-domain-tooltip" :content="row.name!==row.domain?`${row.domain || ''} · ${row.name}`:row.domain || row.name" :show-after="150" :persistent="false"><router-link :to="{name:'Home',query:{site:row.id,section:'work'}}">{{ row.domain || row.name }}</router-link></el-tooltip></th>
          <td v-for="kind in workKinds" :key="kind"><div class="work-capsule-line">
            <el-tooltip :content="tooltip(row,kind)" :show-after="150" :persistent="false"><button type="button" class="work-count" :aria-label="`查看${kind}记录：${row.domain || row.name}`" @click="openHistory(row,kind)">{{ row.stats[kind].count }}</button></el-tooltip>
            <button type="button" class="work-capsule" :class="{'has-records':row.stats[kind].count>0}" :disabled="loading || busy.has(key(row,kind)) || historyBusy" :aria-label="`登记${kind}：${row.domain || row.name}`" :title="`记录一次${kind}`" @click="record(row,kind)">{{ busy.has(key(row,kind))?'保存中…':kind }}</button>
          </div></td>
          <td><el-tooltip :content="row.gsc_account?.email || ''" placement="top" :disabled="openedGsc===row.id || !row.gsc_account?.email" :show-after="150"><el-select :model-value="row.gsc_account?.id" clearable filterable placeholder="未关联" :aria-label="`GSC归属：${row.domain || row.name}`" :disabled="loading || busy.has(row.id+':gsc')" @visible-change="value=>openedGsc=value?row.id:undefined" @change="value=>assign(row,value)"><el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" /></el-select></el-tooltip></td>
        </tr></tbody>
      </table>
      <p v-if="!loading && !visibleRows.length" class="page-empty">{{ rows.length?'没有匹配的网站':'尚无网站' }}</p>
    </div>
    <el-drawer v-model="historyVisible" :title="history?history.kind+'记录':'工作记录'" size="min(560px,96vw)" :before-close="closeHistory" destroy-on-close><p v-if="history" class="page-muted">{{ history.row.domain || history.row.name }}</p><WebsiteWorkHistory v-if="history && historyVisible" :website-id="history.row.id" :kind="history.kind" :revision="historyRevision" @busy="historyBusy=$event" @changed="result=>changed(history!.row,result)" /></el-drawer>
    <GscAccountsDialog v-model:visible="accountsVisible" :accounts="accounts" @changed="load(true)" />
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteWorkHistory from '../components/WebsiteWorkHistory.vue'
import GscAccountsDialog from '../components/GscAccountsDialog.vue'
import { workKinds, type WorkKind } from '../../shared/website-management'
import { getManagement,getGscAccounts,recordWork,undoWork,assignGsc,workTime,type ManagementRow,type GscAccount,type WorkRecord,type RecordResult } from '../api/website-management'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
import { getBatches, type Batch } from '../api/batches'
import '../styles/website-management.css'
const route=useRoute(),router=useRouter(),rows=ref<ManagementRow[]>([]),accounts=ref<GscAccount[]>([])
const batches=ref<Batch[]>([])
const loading=ref(false),error=ref(''),busy=reactive(new Set<string>()),requests=new Map<string,string>()
const openedGsc=ref<number>()
const accountsVisible=ref(false),historyVisible=ref(false),historyBusy=ref(false),historyRevision=ref(0),undoing=ref(false)
const history=ref<{row:ManagementRow;kind:WorkKind}>(),notice=ref<{row:ManagementRow;domain:string;record:WorkRecord}>()
useUnsavedChanges(computed(()=>false),{blocked:computed(()=>busy.size>0 || historyBusy.value || undoing.value)})
const query=(name:string)=>typeof route.query[name]==='string'?String(route.query[name]):''
const filter=(name:string,value:string)=>{const next={...route.query};if(value)next[name]=value;else delete next[name];void router.replace({query:next})}
const hasFilters=computed(()=>['q','view','batch','gsc','sort',...workKinds.map((_,i)=>'work'+i)].some(name=>query(name)))
const clearFilters=()=>{void router.replace({query:{}})}
const latest=(row:ManagementRow)=>Math.max(0,...workKinds.map(kind=>Date.parse(row.stats[kind].last_at || '') || 0))
const visibleRows=computed(()=>{
 const search=query('q').trim().toLowerCase(),gsc=query('gsc'),batch=query('batch'),view=query('view')
 const filtered=rows.value.filter(row=>(!view || view==='all' || row.lifecycle===view) && (!batch || row.batch_ids.includes(Number(batch))) && `${row.name} ${row.domain || ''}`.toLowerCase().includes(search) && (!gsc || (gsc==='none'?!row.gsc_account:String(row.gsc_account?.id)===gsc)) && workKinds.every((kind,index)=>!query('work'+index) || (row.stats[kind].count>0)===(query('work'+index)==='yes')))
 if(['recent','oldest'].includes(query('sort')))filtered.sort((a,b)=>(latest(a)-latest(b))*(query('sort')==='recent'?-1:1)||a.id-b.id)
 return filtered
})
const key=(row:ManagementRow,kind:WorkKind)=>row.id+':'+kind
const tooltip=(row:ManagementRow,kind:WorkKind)=>row.stats[kind].count?`${kind} · 共 ${row.stats[kind].count} 次；最近：${workTime(row.stats[kind].last_at)}（上海时间）；点击查看全部记录`:`${kind}：尚无记录；点击查看历史`
const load=async(force=false)=>{if(busy.size || historyBusy.value || undoing.value)return;loading.value=true;error.value='';try{[rows.value,accounts.value,batches.value]=await Promise.all([getManagement(force),getGscAccounts(force),getBatches(force)])}catch(e){error.value=e instanceof Error?e.message:'网站管理读取失败'}finally{loading.value=false}}
const openAccounts=async()=>{try{accounts.value=await getGscAccounts(true);accountsVisible.value=true}catch(e){ElMessage.error(e instanceof Error?e.message:'账号读取失败')}}
const changed=(row:ManagementRow,result:RecordResult)=>{const current=rows.value.find(item=>item.id===row.id);if(current)current.stats[result.record.kind]=result.stats[result.record.kind];if(notice.value?.record.id===result.record.id && result.record.voided_at)notice.value=undefined}
const record=async(row:ManagementRow,kind:WorkKind)=>{
 const id=key(row,kind);if(busy.has(id))return;busy.add(id)
 const request=requests.get(id)||crypto.randomUUID();requests.set(id,request)
 try{const result=await recordWork(row.id,kind,request);changed(row,result);requests.delete(id);notice.value=result.record.voided_at?undefined:{row,domain:row.domain || row.name,record:result.record};historyRevision.value++}catch(e){ElMessage.error(e instanceof Error?e.message:'登记失败，请重试')}finally{busy.delete(id)}
}
const undoLast=async()=>{const item=notice.value;if(!item || undoing.value)return;undoing.value=true;try{changed(item.row,await undoWork(item.row.id,item.record.id));historyRevision.value++}catch(e){ElMessage.error(e instanceof Error?e.message:'撤销失败')}finally{undoing.value=false}}
const openHistory=(row:ManagementRow,kind:WorkKind)=>{if(historyBusy.value)return;history.value={row,kind};historyVisible.value=true}
const closeHistory=(done:()=>void)=>{if(!historyBusy.value)done()}
const assign=async(row:ManagementRow,value:number|undefined)=>{const id=row.id+':gsc';if(busy.has(id))return;busy.add(id);try{row.gsc_account=await assignGsc(row.id,value ?? null)}catch(e){ElMessage.error(e instanceof Error?e.message:'关联失败')}finally{busy.delete(id)}}
void load(true)
</script>
