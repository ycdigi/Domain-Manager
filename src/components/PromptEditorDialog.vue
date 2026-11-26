<template>
    <el-dialog v-model="visible" class="prompt-editor-dialog" :title="editingId?'编辑提示词':'新增提示词'" width="min(720px, 94vw)" top="5vh" :before-close="beforeEditorClose" :close-on-press-escape="!saving" :close-on-click-modal="!saving" destroy-on-close @open-auto-focus="focusEditor" @opened="focusEditor">
      <p v-if="categoryError" class="prompt-editor-error" role="alert">{{ categoryError }} <el-button text :disabled="categoryLoading" @click="loadCategories">重试分类</el-button></p>
      <div class="prompt-editor" :inert="saving">
        <template v-if="!editingId">
          <el-radio-group v-model="entryMode" aria-label="收集方式"><el-radio-button value="paste">粘贴识别</el-radio-button><el-radio-button value="manual">手动填写</el-radio-button></el-radio-group>
          <div v-if="entryMode==='paste'" class="prompt-paste">
            <label :for="editorId+'-paste'">粘贴原始内容</label><el-input ref="pasteInput" :id="editorId+'-paste'" v-model="pasteText" type="textarea" :rows="7" placeholder="【提示词标题】运营.重复任务自动化&#10;&#10;在这里放提示词正文" />
            <p class="page-muted">例如：运营.重复任务自动化。识别后可分别修改分类、标题和正文。</p><el-button type="primary" plain @click="recognize">识别</el-button>
          </div>
        </template>
        <p v-if="formError" class="prompt-editor-error" role="alert">{{ formError }}</p>
        <div v-if="duplicateId" class="prompt-conflict"><p>当前输入已保留，可查看已有内容后决定是否编辑。</p><el-button @click="viewDuplicate">查看已有提示词</el-button><template v-if="duplicate"><h3>{{ duplicate.category_name||'未分类' }} · {{ duplicate.title }}</h3><pre class="prompt-editor-preview">{{ duplicate.content }}</pre><el-button @click="editDuplicate">编辑已有条目</el-button></template></div>
        <div v-if="identified" class="prompt-identification" role="status"><el-icon><CircleCheck /></el-icon><div><strong>已识别：{{ form.category_name || '未分类' }} · {{ form.title }}</strong><p>分类与标题已拆分，可在下方分别编辑。</p></div></div>
        <el-form :id="formId" label-position="top" aria-label="提示词内容" @submit.prevent="save">
          <h3 class="prompt-form-heading">标题与分类</h3>
          <el-form-item label="分类" :for="editorId+'-category'"><div class="prompt-category-field"><el-select :id="editorId+'-category'" v-model="form.category_name" filterable allow-create default-first-option clearable placeholder="未分类；可输入新分类" aria-label="提示词分类"><el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.name" /></el-select><el-button :icon="Plus" @click="createCategory()">新增分类</el-button></div><p class="prompt-field-help">选择已有分类，也可以直接输入新名称。</p></el-form-item>
          <el-form-item label="标题" :for="editorId+'-title'" required><el-input ref="titleInput" :id="editorId+'-title'" v-model="form.title" name="title" maxlength="200" show-word-limit placeholder="例如：重复任务自动化" required /><p class="prompt-field-help">这里只填写标题，不需要再加“运营.”分类前缀。</p></el-form-item>
          <h3 class="prompt-form-heading">提示词正文</h3>
          <el-form-item label="正文" :for="editorId+'-content'" required><el-input :id="editorId+'-content'" v-model="form.content" name="content" type="textarea" :rows="14" required /></el-form-item>
          <p class="page-muted">{{ form.content.length.toLocaleString() }} / 100,000 字符 · 保存前可直接修改识别结果</p>
        </el-form>
      </div>
      <template #footer><el-button :disabled="saving" @click="closeEditor">取消</el-button><el-button type="primary" native-type="submit" :form="formId" :loading="saving">保存提示词</el-button></template>
    </el-dialog>
</template>
<script setup lang="ts">
import { ref, reactive, computed, watch, useId, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, CircleCheck } from '@element-plus/icons-vue'
import { ElMessage, type InputInstance } from 'element-plus'
import { getPrompt, getPromptCategories, savePrompt, type Prompt, type PromptCategory } from '../api/prompts'
import { parsePromptPaste, validatePromptFields } from '../../shared/prompts'
import { ApiError } from '../utils/request'
import { confirmAction, isDismissed } from '../utils/feedback'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
import { createPromptCategory } from '../utils/create-prompt-category'
import '../styles/dialogs/prompt-editor.css'
const props=defineProps<{prompt?:Prompt}>()
const visible=defineModel<boolean>({default:false})
const emit=defineEmits<{saved:[prompt:Prompt];categoriesChanged:[]}>()
const route=useRoute(),editorId='prompt-editor-'+useId(),formId=editorId+'-form'
const editingId=ref<number>(),entryMode=ref('paste'),pasteText=ref(''),formError=ref(''),saving=ref(false),duplicateId=ref(0),duplicate=ref<Prompt>(),identified=ref(false)
const categories=ref<PromptCategory[]>([]),categoryError=ref(''),categoryLoading=ref(false)
const message=(e:unknown)=>e instanceof Error?e.message:'操作失败，请重试'
const notify=(type:'success'|'error',text:string)=>{ElMessage.closeAll();ElMessage({type,message:text,duration:2000})}
let categoryRequest=0
const loadCategories=async()=>{
 const request=++categoryRequest;categoryLoading.value=true;categoryError.value=''
 try{const result=await getPromptCategories();if(request===categoryRequest)categories.value=result.items}
 catch(e){if(request===categoryRequest)categoryError.value=message(e)}
 finally{if(request===categoryRequest)categoryLoading.value=false}
}
const form=reactive({category_name:'',title:'',content:''})
const baseline=ref('')
const snapshot=()=>JSON.stringify({...form,paste:pasteText.value})
const dirty=computed(()=>visible.value&&snapshot()!==baseline.value)
const {canDiscard}=useUnsavedChanges(dirty,{blocked:computed(()=>saving.value&&visible.value)})
watch(()=>route.fullPath,()=>{visible.value=false})
const closeEditor=async()=>{if(await canDiscard())visible.value=false}
const beforeEditorClose=async(done:()=>void)=>{if(await canDiscard())done()}
const openEditor=(row?:Prompt)=>{identified.value=false;editingId.value=row?.id;Object.assign(form,{category_name:row?.category_name||'',title:row?.title||'',content:row?.content||''});pasteText.value='';formError.value='';duplicateId.value=0;duplicate.value=undefined;baseline.value=snapshot();visible.value=true}
const titleInput=ref<InputInstance>(),pasteInput=ref<InputInstance>()
const focusEditor=(event?:Event)=>{event?.preventDefault();const isPaste=!editingId.value&&entryMode.value==='paste';const input=isPaste?pasteInput.value:titleInput.value;input?.focus();(isPaste?input?.textarea:input?.input)?.scrollIntoView({block:'nearest'})}
const recognize=async()=>{
 try{const parsed=parsePromptPaste(pasteText.value);if(form.title||form.content||form.category_name)await confirmAction('重新识别将替换当前分类、标题和正文，是否继续？','重新识别');Object.assign(form,parsed);formError.value='';duplicateId.value=0;duplicate.value=undefined;identified.value=true}
 catch(e){if(!isDismissed(e))formError.value=message(e)}
}
const save=async()=>{
 if(saving.value)return
 formError.value='';duplicateId.value=0;duplicate.value=undefined
 try{const fields=validatePromptFields(form);saving.value=true;const saved=await savePrompt(fields,editingId.value);baseline.value=snapshot();visible.value=false;notify('success',editingId.value?'修改已保存':'添加成功');emit('saved',saved)}
 catch(e){formError.value=message(e);if(e instanceof ApiError&&e.status===409)duplicateId.value=Number((e.data as any)?.existing_id)||0}
 finally{saving.value=false}
}
const viewDuplicate=async()=>{try{duplicate.value=await getPrompt(duplicateId.value)}catch(e){formError.value=message(e)}}
const editDuplicate=async()=>{if(duplicate.value&&await canDiscard()){openEditor(duplicate.value);await nextTick();focusEditor()}}
const createCategory=async()=>{
 try{
  const name=await createPromptCategory()
  form.category_name=name;emit('categoriesChanged');await loadCategories();notify('success','分类已新增')
 }catch(e){if(!isDismissed(e))formError.value=message(e)}
}
watch(visible,open=>{if(open){entryMode.value='paste';openEditor(props.prompt);void loadCategories()}},{immediate:true})
</script>
