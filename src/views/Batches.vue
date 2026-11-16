<template>
  <div class="workspace-page batches-page">
    <WorkspaceHeading title="网站批次" subtitle="按共同来源、假设和经营动作整理网站"><el-button :loading="loading" @click="load(true)">刷新</el-button><el-button type="primary" @click="createVisible = true">新建批次</el-button></WorkspaceHeading>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <section class="page-panel"><div class="panel-heading"><h2>当前批次</h2><span class="page-muted">{{ activeBatches.length }} 个</span></div><ul v-if="activeBatches.length" class="page-list"><li v-for="batch in activeBatches" :key="batch.id"><div><button class="page-link batch-list-title" @click="open(batch.id)">{{ batch.name }}</button><p class="page-muted">{{ batch.status }} · {{ batch.member_count || 0 }} 个网站<template v-if="batch.source"> · {{ batch.source }}</template></p><small v-if="batch.goal" class="page-muted">{{ batch.goal }}</small></div><el-button size="small" @click="open(batch.id)">打开批次</el-button></li></ul><p v-else class="page-empty">还没有进行中的批次。</p></section>
    <section class="page-panel"><div class="panel-heading"><h2>历史批次</h2><span class="page-muted">{{ archivedBatches.length }} 个</span></div><ul v-if="archivedBatches.length" class="page-list"><li v-for="batch in archivedBatches" :key="batch.id"><div><button class="page-link" @click="open(batch.id)">{{ batch.name }}</button><p class="page-muted">{{ batch.status }} · {{ batch.member_count || 0 }} 个网站</p></div><el-button text @click="open(batch.id)">查看</el-button></li></ul><p v-else class="page-empty">暂无已归档批次。</p></section>
    <el-dialog v-model="createVisible" title="新建批次" width="min(560px, 94vw)" destroy-on-close><el-form label-position="top" @submit.prevent="create"><el-form-item label="批次名称" required><el-input v-model="form.name" maxlength="200" /></el-form-item><el-form-item label="来源"><el-input v-model="form.source" maxlength="200" placeholder="例如：2026 年 11 月域名导入" /></el-form-item><el-form-item label="目标"><el-input v-model="form.goal" type="textarea" :rows="2" maxlength="2000" /></el-form-item><el-form-item label="初始假设"><el-input v-model="form.hypothesis" type="textarea" :rows="2" maxlength="2000" /></el-form-item></el-form><template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="create">创建批次</el-button></template></el-dialog>
  </div>
</template>
<script setup lang="ts">
import '../styles/workspace/batches.css'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import { createBatch, getBatches, batches } from '../api/batches'
const router = useRouter(); const loading = ref(false); const saving = ref(false); const error = ref(''); const createVisible = ref(false); const form = reactive({ name: '', source: '', goal: '', hypothesis: '' })
const load = async (force = false) => { loading.value = true; error.value = ''; try { await getBatches(force) } catch (e) { error.value = e instanceof Error ? e.message : '批次加载失败' } finally { loading.value = false } }
onMounted(() => { void load() })
const activeBatches = computed(() => (batches.value || []).filter(batch => batch.status !== '已归档'))
const archivedBatches = computed(() => (batches.value || []).filter(batch => batch.status === '已归档'))
const open = (id: number) => { void router.push({ name: 'BatchDetail', params: { id } }) }
const create = async () => { if (!form.name.trim() || saving.value) return; saving.value = true; try { const created = await createBatch(form); createVisible.value = false; Object.assign(form, { name: '', source: '', goal: '', hypothesis: '' }); open(created.id); ElMessage.success('批次已创建') } catch (e) { ElMessage.error(e instanceof Error ? e.message : '批次创建失败') } finally { saving.value = false } }
</script>
