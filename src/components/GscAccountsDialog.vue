<template>
  <el-dialog :model-value="visible" title="管理 GSC 账号" width="min(680px,94vw)" :before-close="close" @update:model-value="emit('update:visible',$event)" destroy-on-close>
    <p class="page-muted">这里只记录账号名称和邮箱，不保存 Google 密码。已有网站关联的账号需先解除关联再删除。</p>
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <el-form label-position="top" @submit.prevent="save">
      <div class="page-form-grid"><el-form-item label="账号名称" required><el-input v-model="form.name" aria-label="账号名称" maxlength="120" required :disabled="busy" /></el-form-item><el-form-item label="账号邮箱"><el-input v-model="form.email" aria-label="账号邮箱" type="email" maxlength="254" :disabled="busy" /></el-form-item></div>
      <div class="page-actions"><el-button v-if="editingId" :disabled="busy" @click="reset">取消编辑</el-button><el-button type="primary" native-type="submit" :loading="busy">保存账号</el-button></div>
    </el-form>
    <ul class="page-list"><li v-for="account in accounts" :key="account.id"><div><strong>{{ account.name }}</strong><small class="page-muted"> · {{ account.email || '未填邮箱' }} · {{ account.linked_websites || 0 }} 个网站</small></div><div class="page-actions"><el-button text :disabled="busy" :aria-label="`编辑账号：${account.name}`" @click="edit(account)">编辑</el-button><el-button text type="danger" :disabled="busy || Boolean(account.linked_websites)" :aria-label="`删除账号：${account.name}`" @click="remove(account)">删除</el-button></div></li></ul>
    <template #footer><el-button :disabled="busy" @click="close(()=>emit('update:visible',false))">关闭账号管理</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { saveGscAccount, removeGscAccount, type GscAccount } from '../api/website-management'
import { confirmDiscard, useUnsavedChanges } from '../composables/useUnsavedChanges'
import { confirmAction, isDismissed } from '../utils/feedback'
const props=defineProps<{visible:boolean;accounts:GscAccount[]}>()
const emit=defineEmits<{'update:visible':[value:boolean];changed:[]}>()
const form=reactive({name:'',email:''}),baseline=ref(''),editingId=ref<number>(),busy=ref(false),error=ref('')
const dirty=computed(()=>props.visible && JSON.stringify(form)!==baseline.value)
useUnsavedChanges(dirty,{blocked:computed(()=>props.visible && busy.value)})
const reset=()=>{form.name='';form.email='';editingId.value=undefined;baseline.value=JSON.stringify(form);error.value=''}
const edit=async(account:GscAccount)=>{if(!await confirmDiscard(dirty.value))return;Object.assign(form,{name:account.name,email:account.email});editingId.value=account.id;baseline.value=JSON.stringify(form);error.value=''}
const save=async()=>{if(busy.value)return;busy.value=true;error.value='';try{await saveGscAccount(editingId.value,{name:form.name.trim(),email:form.email.trim()});reset();emit('changed')}catch(e){error.value=e instanceof Error?e.message:'账号保存失败'}finally{busy.value=false}}
const remove=async(account:GscAccount)=>{try{await confirmAction(`删除 GSC 账号“${account.name}”？`,'删除账号');busy.value=true;await removeGscAccount(account.id);if(editingId.value===account.id)reset();emit('changed')}catch(e){if(!isDismissed(e))error.value=e instanceof Error?e.message:'账号删除失败'}finally{busy.value=false}}
const close=async(done:()=>void)=>{if(!busy.value && await confirmDiscard(dirty.value))done()}
watch(()=>props.visible,value=>{if(value)reset()},{immediate:true})
</script>
