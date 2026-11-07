<template>
  <div class="workspace-nav" :class="{ 'nav-compact': collapsed }">
    <div class="workspace-nav-header">
      <span v-if="!collapsed" class="workspace-nav-name">网站组合</span>
      <button type="button" class="nav-toggle" :aria-label="mobile ? '关闭导航' : collapsed ? '展开导航' : '收起导航'" @click="mobile ? emit('close') : emit('collapse')"><el-icon><Close v-if="mobile" /><Expand v-else-if="collapsed" /><Fold v-else /></el-icon></button>
    </div>
    <nav class="workspace-nav-groups" aria-label="工作区导航">
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">网站组合</p>
        <button v-for="tab in portfolioTabs" :key="tab.value" type="button" class="workspace-nav-item" :class="{ 'is-active': activePortfolio === tab.value }" :aria-pressed="activePortfolio === tab.value" :aria-label="tab.label" :title="`${tab.label} · ${counts[tab.value] || 0} 个网站`" @click="emit('selectPortfolio', tab.value)">
          <el-icon aria-hidden="true"><Grid /></el-icon><span v-if="!collapsed" class="workspace-nav-text">{{ tab.label }}</span><span v-if="!collapsed" class="workspace-nav-count">{{ counts[tab.value] || 0 }}</span>
        </button>
      </div>
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">管理</p>
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
import { ref, onMounted, onUnmounted } from 'vue'
import type { DropdownInstance } from 'element-plus'
import { Close, Coin, Connection, Download, Expand, Fold, FolderOpened, Grid, MoreFilled } from '@element-plus/icons-vue'
defineProps<{ portfolioTabs: Array<{ label: string; value: string }>; counts: Record<string, number>; activePortfolio: string; activeManager: string; collapsed?: boolean; mobile?: boolean }>()
const emit = defineEmits<{ selectPortfolio: [value: string]; manage: [value: 'domains' | 'resources' | 'adsense' | 'data']; collapse: []; close: []; backup: []; logout: [] }>()
const moreMenu = ref<DropdownInstance>()
const closeMoreMenu = () => moreMenu.value?.handleClose()
onMounted(() => window.addEventListener('resize', closeMoreMenu))
onUnmounted(() => window.removeEventListener('resize', closeMoreMenu))
</script>

<style scoped src="../styles/home/navigation.css"></style>
