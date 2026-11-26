<template>
  <div class="workspace-page prompts-page">
    <WorkspaceHeading title="提示词库" subtitle="收集、整理，随时复制使用">
      <el-button :disabled="loading" @click="refreshAll">刷新</el-button><el-button type="primary" @click="newPrompt">新增提示词</el-button>
    </WorkspaceHeading>
    <p v-if="loadError" class="prompt-error" role="alert">{{ loadError }} <el-button text @click="refreshAll">重试</el-button></p>
    <div class="prompt-toolbar">
      <search><form class="prompt-search" aria-label="搜索提示词库" @submit.prevent="submitSearch">
        <el-input v-model="searchText" aria-label="搜索提示词" placeholder="搜索标题、正文或分类" clearable maxlength="1000" @clear="submitSearch" /><el-button native-type="submit">搜索</el-button>
      </form></search>
      <span class="page-muted">{{ categories.total }} 条提示词 · {{ categories.items.length }} 个分类</span>
    </div>
    <div class="prompt-workspace">
      <aside class="prompt-categories" aria-label="提示词分类">
        <div class="panel-heading"><h2>分类</h2><el-button text @click="manageVisible=true">管理</el-button></div>
        <el-button class="prompt-add-category" :icon="Plus" @click="createCategory()">新增分类</el-button>
        <button v-for="item in filters" :key="item.key" type="button" class="prompt-filter" :class="{'is-active':filter===item.key}" :aria-pressed="filter===item.key" @click="setFilter(item.key)"><span class="prompt-filter-label" :title="item.label">{{ item.label }}</span><span>{{ item.count }}</span></button>
      </aside>
      <section class="prompt-list-panel" aria-label="提示词列表" :aria-busy="loading">
        <div class="prompt-list-meta"><h2>{{ activeFilterLabel }} <span>{{ listing.total }}</span></h2><el-button v-if="filter!=='all'||route.query.q" text @click="clearFilters">清空条件</el-button></div>
        <p v-if="!loading && !listing.items.length" class="prompt-empty">{{ filter!=='all'||route.query.q ? '没有匹配结果，试试清空条件。' : '还没有提示词，点击“新增提示词”开始收集。' }}</p>
        <ul class="prompt-list">
          <li v-for="item in listing.items" :key="item.id" class="prompt-card" :class="{'is-active':selectedId===item.id}">
            <button type="button" class="prompt-open" :aria-label="`查看提示词：${item.title}`" :aria-pressed="selectedId===item.id" @click="selectPrompt(item.id)"><span class="prompt-card-heading"><strong :title="item.title">{{ item.title }}</strong><span class="prompt-card-category" :title="item.category_name||'未分类'">{{ item.category_name||'未分类' }}</span></span><span class="prompt-excerpt">{{ item.excerpt }}</span></button>
            <div class="prompt-card-actions"><el-button text :disabled="!!favoriteBusy" :aria-label="`${item.is_favorite?'取消收藏':'收藏'}：${item.title}`" :aria-pressed="!!item.is_favorite" @click="toggleFavorite(item)"><el-icon><StarFilled v-if="item.is_favorite" /><Star v-else /></el-icon>{{ item.is_favorite?'已收藏':'收藏' }}</el-button><el-button @click="copyItem(item.id)">复制正文</el-button></div>
          </li>
        </ul>
        <el-pagination v-if="listing.total>30" small layout="prev, pager, next" :total="listing.total" :page-size="30" :current-page="currentPage" @current-change="setPage" />
      </section>
      <section v-if="!mobile" class="prompt-detail" aria-label="提示词详情" :aria-busy="detailLoading">
        <p v-if="detailError" class="prompt-error" role="alert">{{ detailError }} <el-button text @click="loadDetail">重试</el-button></p>
        <PromptDetail v-else-if="selected && !detailLoading" :prompt="selected" @copy="copySelected" @edit="editSelected" @delete="removeSelected" />
        <p v-else class="prompt-empty">{{ detailLoading?'正在读取正文…':'选择一条提示词，查看完整内容。' }}</p>
      </section>
    </div>
    <el-drawer v-if="mobile" :model-value="!!selectedId&&!editorVisible" title="提示词详情" size="100%" @update:model-value="closeDetail">
      <p v-if="detailError" role="alert">{{ detailError }} <el-button @click="loadDetail">重试</el-button></p>
      <PromptDetail v-else-if="selected&&!detailLoading" :prompt="selected" @copy="copySelected" @edit="editSelected" @delete="removeSelected" /><p v-else>正在读取正文…</p>
    </el-drawer>
    <PromptEditorDialog v-model="editorVisible" :prompt="editingPrompt" @saved="onPromptSaved" @categories-changed="refresh" />
    <el-dialog v-model="manageVisible" title="管理分类" width="min(580px, 94vw)" :close-on-click-modal="false">
      <form class="prompt-category-create" @submit.prevent="addCategory"><el-input v-model="newCategory" aria-label="新分类名称" placeholder="新分类名称" maxlength="50" /><el-button native-type="submit" :disabled="categoryBusy">新增分类</el-button></form>
      <p v-if="categoryError" class="prompt-error" role="alert">{{ categoryError }}</p>
      <ul class="prompt-category-management"><li v-for="item in categories.items" :key="item.id"><span>{{ item.name }}（{{ item.count }}）</span><el-button text :disabled="categoryBusy" @click="renameCategory(item)">改名</el-button><el-button text type="danger" :disabled="categoryBusy" @click="removeCategory(item)">删除</el-button></li></ul>
      <p class="page-muted">删除分类会将其中的提示词移到未分类，正文仍然保留。</p>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Star, StarFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import PromptDetail from '../components/PromptDetail.vue'
import PromptEditorDialog from '../components/PromptEditorDialog.vue'
import { getPrompts, getPrompt, getPromptCategories, favoritePrompt, deletePrompt, savePromptCategory, deletePromptCategory, type Prompt, type PromptSummary, type PromptCategory, type PromptCategories, type PromptList } from '../api/prompts'
import { formatPrompt } from '../../shared/prompts'
import { copyText } from '../utils/clipboard'
import { ApiError } from '../utils/request'
import { confirmAction, isDismissed } from '../utils/feedback'
import { createPromptCategory } from '../utils/create-prompt-category'
import '../styles/prompts.css'
const route=useRoute(), router=useRouter()
const categories=ref<PromptCategories>({items:[],total:0,favorites:0,uncategorized:0})
const listing=ref<PromptList>({items:[],total:0,page:1,page_size:30})
const searchText=ref(''), loading=ref(false), loadError=ref(''), detailError=ref(''), selected=ref<Prompt>(), detailLoading=ref(false)
const selectedId=computed(()=>Number(route.query.id)||0)
const currentPage=computed(()=>Math.max(1,Number(route.query.page)||1))
const filter=computed(()=>route.query.favorite==='1'?'favorites':route.query.category ? String(route.query.category) : 'all')
const activeFilterLabel=computed(()=>filters.value.find(item=>item.key===filter.value)?.label || '全部')
const filters=computed(()=>[{key:'all',label:'全部',count:categories.value.total},{key:'favorites',label:'收藏',count:categories.value.favorites},{key:'none',label:'未分类',count:categories.value.uncategorized},...categories.value.items.map(c=>({key:String(c.id),label:c.name,count:c.count}))])
const media=window.matchMedia('(max-width: 900px)'), mobile=ref(media.matches)
const mediaChange=()=>{mobile.value=media.matches}
onMounted(()=>media.addEventListener('change',mediaChange));onUnmounted(()=>{media.removeEventListener('change',mediaChange);listRequest++;detailRequest++})
const queryUpdate=(patch:Record<string,string|undefined>)=>router.push({query:{...route.query,...patch}})
const setFilter=(key:string)=>queryUpdate({favorite:key==='favorites'?'1':undefined,category:['all','favorites'].includes(key)?undefined:key,page:undefined,id:undefined})
const setPage=(page:number)=>queryUpdate({page:String(page),id:undefined})
const submitSearch=()=>queryUpdate({q:searchText.value||undefined,page:undefined,id:undefined})
const clearFilters=()=>{searchText.value='';void queryUpdate({q:undefined,category:undefined,favorite:undefined,page:undefined,id:undefined})}
const selectPrompt=(id:number)=>queryUpdate({id:String(id)})
const closeDetail=(visible:boolean)=>{if(!visible&&!editorVisible.value)void queryUpdate({id:undefined})}
let listRequest=0,detailRequest=0
const refresh=async()=>{
 const sequence=++listRequest;loading.value=true;loadError.value=''
 const params=new URLSearchParams()
 for(const field of ['q','category','favorite','page'])if(route.query[field])params.set(field,String(route.query[field]))
 try {const [rows,groups]=await Promise.all([getPrompts(params),getPromptCategories()]);if(sequence!==listRequest)return;listing.value=rows;categories.value=groups;const lastPage=Math.max(1,Math.ceil(rows.total/30));if(currentPage.value>lastPage)void router.replace({query:{...route.query,page:lastPage===1?undefined:String(lastPage)}})}
 catch(e){if(sequence===listRequest)loadError.value=message(e)}finally{if(sequence===listRequest)loading.value=false}
}
const loadDetail=async()=>{
 const sequence=++detailRequest;selected.value=undefined;detailError.value='';detailLoading.value=false
 if(!selectedId.value)return
 detailLoading.value=true
 try {const row=await getPrompt(selectedId.value);if(sequence===detailRequest)selected.value=row}
 catch(e){if(sequence===detailRequest)detailError.value=message(e)}finally{if(sequence===detailRequest)detailLoading.value=false}
}
const refreshAll=()=>Promise.all([refresh(),loadDetail()])
watch(()=>[route.query.q,route.query.category,route.query.favorite,route.query.page],()=>{searchText.value=String(route.query.q||'');void refresh()},{immediate:true})
watch(selectedId,()=>{void loadDetail()},{immediate:true})
const notify=(type:'success'|'error'|'info',text:string)=>{ElMessage.closeAll();ElMessage({type,message:text,duration:2000})}
const message=(e:unknown)=>e instanceof Error?e.message:'操作失败，请重试'
const copyValue=async(row:Prompt,full=false)=>{try{await copyText(full?formatPrompt(row):row.content);notify('success',full?'已复制完整格式':'已复制正文')}catch(e){notify('error',`${message(e)}，请在详情中手动选中正文复制`)}}
const copyItem=async(id:number)=>{try{await copyValue(await getPrompt(id))}catch(e){notify('error',message(e))}}
const copySelected=(full:boolean)=>{if(selected.value)void copyValue(selected.value,full)}
const favoriteBusy=ref(0)
const toggleFavorite=async(item:PromptSummary)=>{favoriteBusy.value=item.id;try{const row=await favoritePrompt(item.id,!item.is_favorite);if(selected.value?.id===row.id)selected.value=row;await refresh()}catch(e){notify('error',message(e))}finally{favoriteBusy.value=0}}
const editorVisible=ref(false),editingPrompt=ref<Prompt>()
const newPrompt=()=>{editingPrompt.value=undefined;editorVisible.value=true}
const editSelected=()=>{if(selected.value){editingPrompt.value=selected.value;editorVisible.value=true}}
const onPromptSaved=async(saved:Prompt)=>{
 await refresh();await selectPrompt(saved.id);await loadDetail()
 if(!listing.value.items.some(i=>i.id===saved.id))notify('info','已保存并打开详情；条目可能不在当前筛选或分页中')
}
const removeSelected=async()=>{
 if(!selected.value)return
 const row=selected.value
 try{await confirmAction(`删除“${row.title}”？删除后可通过已有备份恢复。`,'删除提示词');await deletePrompt(row.id);await queryUpdate({id:undefined});await refresh();notify('success','提示词已删除')}
 catch(e){if(!isDismissed(e))notify('error',message(e))}
}
const manageVisible=ref(false),newCategory=ref(''),categoryBusy=ref(false),categoryError=ref('')
const categoryAction=async(action:()=>Promise<unknown>)=>{categoryBusy.value=true;categoryError.value='';try{await action();await refresh();await loadDetail()}catch(e){if(!isDismissed(e)){categoryError.value=message(e);if(e instanceof ApiError&&(e.data as any)?.conflicts)categoryError.value+='：'+(e.data as any).conflicts.map((r:any)=>r.title).join('、')}}finally{categoryBusy.value=false}}
const createCategory=async()=>{
 try {
  await createPromptCategory()
  await refresh()
  notify('success','分类已新增')
 }catch(e){if(!isDismissed(e))notify('error',message(e))}
}
const addCategory=()=>categoryAction(async()=>{await savePromptCategory(newCategory.value);newCategory.value=''})
const renameCategory=(item:PromptCategory)=>categoryAction(async()=>{const result=await ElMessageBox.prompt('填写新的分类名称','分类改名',{inputValue:item.name,confirmButtonText:'保存',cancelButtonText:'取消'});await savePromptCategory(result.value,item.id)})
const removeCategory=(item:PromptCategory)=>categoryAction(async()=>{await confirmAction(`删除分类“${item.name}”？其中 ${item.count} 条提示词将移到未分类。`,'删除分类');await deletePromptCategory(item.id);if(filter.value===String(item.id))await setFilter('none')})
</script>
