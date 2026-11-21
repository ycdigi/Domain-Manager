<template>
  <div class="workspace-nav" :class="{ 'nav-compact': collapsed }">
    <div class="workspace-nav-header">
      <span v-if="!collapsed" class="workspace-nav-name">网站管理</span>
      <button type="button" class="nav-toggle" :aria-label="mobile ? '关闭导航' : collapsed ? '展开导航' : '收起导航'" @click="mobile ? emit('close') : emit('collapse')"><el-icon><Close v-if="mobile" /><Expand v-else-if="collapsed" /><Fold v-else /></el-icon></button>
    </div>
    <nav class="workspace-nav-groups" aria-label="工作区导航">
      <div class="workspace-nav-group">
        <button v-for="item in primaryItems" :key="item.value" type="button" class="workspace-nav-item" :class="{'is-active':activeManager===item.value}" :title="item.label" :aria-label="item.label" @click="emit('manage',item.value)"><el-icon><component :is="item.icon" /></el-icon><span v-if="!collapsed" class="workspace-nav-text">{{ item.label }}</span><span v-if="item.value==='monitor'&&monitorUnread" class="monitor-unread">{{ monitorUnread }}</span></button>
      </div>
      <details class="workspace-nav-group" :open="['work','batches','finance','adsense'].includes(activeManager)"><summary :title="collapsed?'运营管理':undefined">{{ collapsed?'运营':'运营管理' }}</summary>
        <button v-for="item in operationItems" :key="item.value" type="button" class="workspace-nav-item" :class="{'is-active':activeManager===item.value}" :title="item.label" :aria-label="item.label" @click="emit('manage',item.value)"><el-icon><component :is="item.icon" /></el-icon><span v-if="!collapsed" class="workspace-nav-text">{{ item.label }}</span><span v-if="item.value==='work'&&queueCounts.total" class="monitor-unread">{{ queueCounts.total }}</span></button>
      </details>
      <div class="workspace-nav-group"><button type="button" class="workspace-nav-item" :class="{'is-active':activeManager==='data'}" title="数据管理" @click="emit('manage','data')"><el-icon><Download /></el-icon><span v-if="!collapsed" class="workspace-nav-text">数据管理</span></button></div>
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
import { Close, Coin, Collection, Connection, Download, Expand, Fold, FolderOpened, Grid, List, Monitor, MoreFilled } from '@element-plus/icons-vue'
const props = defineProps<{ activeManager: string; monitorUnread?: number; queueCounts?: { total: number }; collapsed?: boolean; mobile?: boolean }>()
const queueCounts = computed(() => props.queueCounts || { total: 0 })
const emit = defineEmits<{ manage: [value: 'work' | 'batches' | 'monitor' | 'domains' | 'resources' | 'adsense' | 'finance' | 'home' | 'data']; collapse: []; close: []; backup: []; logout: [] }>()
const primaryItems=[{value:'home',label:'网站总表',icon:Grid},{value:'domains',label:'域名资产',icon:Connection},{value:'resources',label:'部署与账号',icon:FolderOpened},{value:'monitor',label:'网站监控',icon:Monitor}] as const
const operationItems=[{value:'work',label:'待处理',icon:List},{value:'batches',label:'网站批次',icon:Collection},{value:'finance',label:'收入与投入',icon:Coin},{value:'adsense',label:'AdSense',icon:Coin}] as const
const moreMenu = ref<DropdownInstance>()
const closeMoreMenu = () => moreMenu.value?.handleClose()
onMounted(() => window.addEventListener('resize', closeMoreMenu))
onUnmounted(() => window.removeEventListener('resize', closeMoreMenu))
</script>

<style scoped src="../styles/home/navigation.css"></style>
