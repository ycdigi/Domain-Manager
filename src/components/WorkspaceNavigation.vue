<template>
  <div class="workspace-nav" :class="{ 'nav-compact': collapsed }">
    <div class="workspace-nav-header">
      <span v-if="!collapsed" class="workspace-nav-name">网站组合</span>
      <button type="button" class="nav-toggle" :aria-label="mobile ? '关闭导航' : collapsed ? '展开导航' : '收起导航'" @click="mobile ? emit('close') : emit('collapse')"><el-icon><Close v-if="mobile" /><Expand v-else-if="collapsed" /><Fold v-else /></el-icon></button>
    </div>
    <nav class="workspace-nav-groups" aria-label="工作区导航">
      <div class="workspace-nav-group workspace-nav-primary">
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'work' }" aria-label="待处理" :title="`待处理 · ${queueCounts.total || 0} 项`" @click="emit('manage', 'work')"><el-icon><List /></el-icon><span v-if="!collapsed" class="workspace-nav-text">待处理</span><span v-if="queueCounts.total" class="monitor-unread" :aria-label="`${queueCounts.total} 项待处理`">{{ queueCounts.total }}</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'batches' }" aria-label="网站批次" title="网站批次" @click="emit('manage', 'batches')"><el-icon><Collection /></el-icon><span v-if="!collapsed" class="workspace-nav-text">网站批次</span><span v-if="!collapsed" class="workspace-nav-count">{{ batches.filter(batch => batch.status !== '已归档').length }}</span></button>
        <button v-for="batch in recentBatches" :key="batch.id" type="button" class="workspace-nav-item workspace-nav-batch" :class="{ 'is-active': activeBatch === batch.id }" :aria-label="`批次：${batch.name}`" :title="`${batch.name} · ${batch.member_count || 0} 个网站`" @click="emit('openBatch', batch.id)"><el-icon aria-hidden="true"><CollectionTag /></el-icon><span v-if="!collapsed" class="workspace-nav-text">{{ batch.name }}</span><span v-if="!collapsed" class="workspace-nav-count">{{ batch.member_count || 0 }}</span></button>
      </div>
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">网站归属</p>
        <button v-for="filter in ownershipFilters" :key="filter.value" type="button" class="workspace-nav-item" :class="{ 'is-active': activeOwnership === filter.value }" :aria-pressed="activeOwnership === filter.value" :aria-label="filter.label" :title="`${filter.label} · ${counts.ownership[filter.value] || 0} 个网站`" @click="emit('selectFilter', 'ownership', filter.value)">
          <el-icon aria-hidden="true"><component :is="ownershipIcon(filter.value)" /></el-icon><span v-if="!collapsed" class="workspace-nav-text">{{ filter.label }}</span><span v-if="!collapsed" class="workspace-nav-count">{{ counts.ownership[filter.value] || 0 }}</span>
        </button>
      </div>
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">技术栈</p>
        <button v-for="filter in platformFilters" :key="filter.value" type="button" class="workspace-nav-item" :class="{ 'is-active': activePlatform === filter.value }" :aria-pressed="activePlatform === filter.value" :aria-label="filter.label" :title="`${filter.label} · ${counts.platform[filter.value] || 0} 个网站`" @click="emit('selectFilter', 'platform', filter.value)">
          <el-icon aria-hidden="true"><component :is="platformIcon(filter.value)" /></el-icon><span v-if="!collapsed" class="workspace-nav-text">{{ filter.label }}</span><span v-if="!collapsed" class="workspace-nav-count">{{ counts.platform[filter.value] || 0 }}</span>
        </button>
      </div>
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">管理</p>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'monitor' }" aria-label="网站监控" :title="`网站监控 · ${monitorUnread || 0} 条未读`" @click="emit('manage', 'monitor')"><el-icon><Monitor /></el-icon><span v-if="!collapsed" class="workspace-nav-text">网站监控</span><span v-if="monitorUnread" class="monitor-unread" :aria-label="`${monitorUnread} 条未读事件`">{{ monitorUnread }}</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'domains' }" aria-label="域名资产" @click="emit('manage', 'domains')"><el-icon><Connection /></el-icon><span v-if="!collapsed" class="workspace-nav-text">域名资产</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'resources' }" aria-label="资源管理" @click="emit('manage', 'resources')"><el-icon><FolderOpened /></el-icon><span v-if="!collapsed" class="workspace-nav-text">资源管理</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'adsense' }" aria-label="AdSense 管理" @click="emit('manage', 'adsense')"><el-icon><Coin /></el-icon><span v-if="!collapsed" class="workspace-nav-text">AdSense 管理</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'data' }" aria-label="数据管理" @click="emit('manage', 'data')"><el-icon><Download /></el-icon><span v-if="!collapsed" class="workspace-nav-text">数据管理</span></button>
      </div>
    </nav>
    <div class="workspace-nav-footer">
      <el-dropdown ref="moreMenu" trigger="click" placement="top-start">
        <button type="button" class="workspace-nav-item" aria-label="更多" @keydown.esc="closeMoreMenu"><el-icon><MoreFilled /></el-icon><span v-if="!collapsed" class="workspace-nav-text">更多</span></button>
        <template #dropdown><el-dropdown-menu @keydown.esc="closeMoreMenu"><el-dropdown-item @click="emit('backup')">导出 JSON 备份</el-dropdown-item><el-dropdown-item divided @click="emit('logout')">登出</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { DropdownInstance } from 'element-plus'
import { Close, Coin, Collection, CollectionTag, Connection, Cpu, Document, Download, Expand, Fold, FolderOpened, Grid, House, Lightning, List, Monitor, MoreFilled, OfficeBuilding, QuestionFilled } from '@element-plus/icons-vue'
import type { Batch } from '../api/batches'
const props = defineProps<{ ownershipFilters: Array<{ label: string; value: string }>; platformFilters: Array<{ label: string; value: string }>; counts: { ownership: Record<string, number>; platform: Record<string, number> }; activeOwnership: string; activePlatform: string; activeManager: string; activeBatch?: number; monitorUnread?: number; queueCounts?: { total: number }; batches?: Batch[]; collapsed?: boolean; mobile?: boolean }>()
const batches = computed(() => props.batches || [])
const queueCounts = computed(() => props.queueCounts || { total: 0 })
const recentBatches = computed(() => batches.value.filter(batch => batch.status !== '已归档').slice(0, 3))
const emit = defineEmits<{ selectFilter: [kind: 'ownership' | 'platform', value: string]; manage: [value: 'work' | 'batches' | 'monitor' | 'domains' | 'resources' | 'adsense' | 'data']; openBatch: [id: number]; collapse: []; close: []; backup: []; logout: [] }>()
const ownershipIcon = (value: string) => ({ all: Grid, '自营网站': House, '企业客户网站': OfficeBuilding, '未分类': QuestionFilled })[value] || Grid
const platformIcon = (value: string) => ({ all: Grid, Astro: Lightning, 'Next.js': Connection, WordPress: Document, '其他': Cpu })[value] || Monitor
const moreMenu = ref<DropdownInstance>()
const closeMoreMenu = () => moreMenu.value?.handleClose()
onMounted(() => window.addEventListener('resize', closeMoreMenu))
onUnmounted(() => window.removeEventListener('resize', closeMoreMenu))
</script>

<style scoped src="../styles/home/navigation.css"></style>
