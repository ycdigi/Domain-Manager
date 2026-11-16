<template>
  <div class="workspace-page work-queue-page">
    <WorkspaceHeading title="待处理" subtitle="按行动优先级集中处理需要你确认的事项"><el-button :loading="loading" @click="load(true)">刷新</el-button></WorkspaceHeading>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button @click="load(true)">重试</el-button></div>
    <div class="work-queue-summary" aria-label="待处理数量"><article v-for="item in summaryItems" :key="item.key" class="work-queue-summary-card"><strong>{{ item.count }}</strong><span>{{ item.label }}</span></article></div>
    <section v-for="group in groups" :key="group.key" class="page-panel work-queue-group"><div class="panel-heading"><h2>{{ group.label }}</h2><span class="page-muted">{{ group.items.length }} 项</span></div><ul v-if="group.items.length" class="page-list"><li v-for="item in group.items" :key="`${item.type}-${item.website_id || item.batch_id || item.task_id}`"><div><button class="page-link" @click="openItem(item)">{{ item.title }}</button><p class="page-muted">{{ item.detail || '待处理' }}<template v-if="item.due_date"> · 截止 {{ item.due_date }}</template></p></div><el-button size="small" @click="openItem(item)">查看</el-button></li></ul><p v-else class="page-empty">暂无{{ group.label }}。</p></section>
  </div>
</template>
<script setup lang="ts">
import '../styles/workspace/batches.css'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import { getWorkQueue, type WorkQueue, type WorkQueueItem } from '../api/batches'
const router = useRouter(); const loading = ref(false); const error = ref(''); const queue = ref<WorkQueue>({ counts: { monitor: 0, next_action: 0, task: 0, batch: 0, total: 0 }, items: [] })
const load = async (force = false) => { loading.value = true; error.value = ''; try { queue.value = await getWorkQueue(force) } catch (e) { error.value = e instanceof Error ? e.message : '待处理事项加载失败' } finally { loading.value = false } }
onMounted(() => { void load() })
type QueueGroup = { key: WorkQueueItem['type']; label: string; count: number }
const summaryItems = computed<QueueGroup[]>(() => [{ key: 'monitor', label: '监控异常', count: queue.value.counts.monitor }, { key: 'next_action', label: '逾期下一步', count: queue.value.counts.next_action }, { key: 'task', label: '任务待跟进', count: queue.value.counts.task }, { key: 'batch', label: '批次待复盘', count: queue.value.counts.batch }])
const groups = computed(() => summaryItems.value.map(item => ({ ...item, items: queue.value.items.filter(queueItem => queueItem.type === item.key as WorkQueueItem['type']) })))
const openItem = (item: WorkQueueItem) => { if (item.batch_id) void router.push({ name: 'BatchDetail', params: { id: item.batch_id } }); else if (item.website_id) void router.push({ name: 'Home', query: { site: item.website_id } }) }
</script>
