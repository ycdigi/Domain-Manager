<template>
 <div class="workspace-page">
  <WorkspaceHeading title="通知配置"><el-button :disabled="loading || saving" @click="load(true)">重新加载</el-button></WorkspaceHeading>
  <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
  <section class="page-panel" v-loading="loading">
   <el-form v-if="loaded" ref="formRef" :model="form" :rules="rules" label-position="top" class="page-form" @submit.prevent="save">
    <el-form-item label="Telegram Bot Token" prop="tg_token"><el-input v-model="form.tg_token" show-password autocomplete="off" /></el-form-item>
    <el-form-item label="Telegram User ID" prop="tg_userid"><el-input v-model="form.tg_userid" /></el-form-item>
    <el-form-item label="剩余多少天告警" prop="days"><el-input-number v-model="form.days" :min="1" :max="365" /></el-form-item>
    <div class="page-actions"><el-button type="primary" :loading="saving" native-type="submit">保存配置</el-button><el-button :disabled="saving || !dirty" @click="reset">放弃修改</el-button><span role="status" class="page-muted">{{ saved ? '配置已保存' : dirty ? '有未保存修改' : '' }}</span></div>
   </el-form>
  </section>
 </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { type FormInstance, ElMessage } from 'element-plus'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import { invalidateData } from '../utils/workspaceCache'
import { api } from '../utils/request'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
type Config = { tg_token: string; tg_userid: string; days: number }
const form = ref<Config>({ tg_token: '', tg_userid: '', days: 30 })
const original = ref(''); const loading = ref(false); const saving = ref(false); const loaded = ref(false); const error = ref(''); const saved = ref(false)
const formRef = ref<FormInstance>()
const rules = { tg_token: [{ required: true, message: '请输入 Telegram Bot Token', trigger: 'blur' }], tg_userid: [{ required: true, message: '请输入 Telegram User ID', trigger: 'blur' }], days: [{ required: true, message: '请输入告警天数', trigger: 'change' }] }
const dirty = computed(() => loaded.value && JSON.stringify(form.value) !== original.value)
const { canDiscard } = useUnsavedChanges(dirty)
const load = async (force = false) => {
 if (loading.value || (force && !(await canDiscard()))) return
 loading.value = true; error.value = ''; saved.value = false
 try { const value = await api.get<Config | null>('/api/alertconfig'); form.value = value ? { ...value } : { tg_token: '', tg_userid: '', days: 30 }; original.value = JSON.stringify(form.value); loaded.value = true }
 catch (e) { error.value = e instanceof Error ? e.message : '读取通知配置失败' }
 finally { loading.value = false }
}
const reset = async () => { if (await canDiscard()) { form.value = JSON.parse(original.value); saved.value = false } }
const save = async () => {
 if (saving.value || !(await formRef.value?.validate().catch(() => false))) return
 saving.value = true; saved.value = false
 try { await api.post('/api/alertconfig', form.value); original.value = JSON.stringify(form.value); invalidateData('/api/alertconfig'); saved.value = true; ElMessage.success('配置已保存') }
 catch (e) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
 finally { saving.value = false }
}
onMounted(() => { void load() })
</script>
