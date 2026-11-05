<template>
  <div class="workspace-nav" :class="{ 'nav-compact': collapsed }">
    <div class="workspace-nav-header">
      <span v-if="!collapsed" class="workspace-nav-name">网站台账</span>
      <button type="button" class="nav-toggle" :aria-label="mobile ? '关闭导航' : collapsed ? '展开导航' : '收起导航'" :title="mobile ? '关闭导航' : collapsed ? '展开导航' : '收起导航'" @click="mobile ? emit('close') : emit('collapse')">
        <el-icon><Close v-if="mobile" /><Expand v-else-if="collapsed" /><Fold v-else /></el-icon>
      </button>
    </div>
    <nav class="workspace-nav-groups" aria-label="工作区导航">
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">网站</p>
        <button v-for="tab in tabs" :key="tab.value" type="button" class="workspace-nav-item" :class="{ 'is-active': active === tab.value }" :aria-pressed="active === tab.value" :aria-label="tab.label === '全部' ? '全部网站' : tab.label" :title="`${tab.label === '全部' ? '全部网站' : tab.label} · ${counts[tab.value]} 个网站`" @click="emit('select', tab.value)">
          <el-icon aria-hidden="true"><Grid v-if="tab.value === 'all'" /><Lightning v-else-if="tab.value === 'Astro'" /><Connection v-else-if="tab.value === 'Next.js'" /><Document v-else /></el-icon>
          <span v-if="!collapsed" class="workspace-nav-text">{{ tab.label === '全部' ? '全部网站' : tab.label }}</span>
          <span v-if="!collapsed" class="workspace-nav-count" aria-hidden="true">{{ counts[tab.value] }}</span>
        </button>
      </div>
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">管理</p>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'resources' }" aria-label="资源管理" title="资源管理" @click="emit('manage', 'resources')"><el-icon aria-hidden="true"><FolderOpened /></el-icon><span v-if="!collapsed" class="workspace-nav-text">资源管理</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'adsense' }" aria-label="AdSense 管理" title="AdSense 管理" @click="emit('manage', 'adsense')"><el-icon aria-hidden="true"><Coin /></el-icon><span v-if="!collapsed" class="workspace-nav-text">AdSense 管理</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'notifications' }" aria-label="通知配置" title="通知配置" @click="emit('manage', 'notifications')"><el-icon aria-hidden="true"><Bell /></el-icon><span v-if="!collapsed" class="workspace-nav-text">通知配置</span></button>
      </div>
    </nav>
    <div class="workspace-nav-footer">
      <el-dropdown ref="moreMenu" trigger="click" placement="top-start">
        <button type="button" class="workspace-nav-item" aria-label="更多" title="更多" @keydown.esc="closeMoreMenu"><el-icon aria-hidden="true"><MoreFilled /></el-icon><span v-if="!collapsed" class="workspace-nav-text">更多</span></button>
        <template #dropdown><el-dropdown-menu @keydown.esc="closeMoreMenu"><el-dropdown-item @click="emit('backup')">导出 JSON 备份</el-dropdown-item><el-dropdown-item divided @click="emit('logout')">登出</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { DropdownInstance } from 'element-plus';
import { Grid, Lightning, Connection, Document, FolderOpened, Coin, Bell, MoreFilled, Close, Expand, Fold } from '@element-plus/icons-vue';
const moreMenu = ref<DropdownInstance>();
const closeMoreMenu = () => { moreMenu.value?.handleClose(); };
onMounted(() => window.addEventListener('resize', closeMoreMenu));
onUnmounted(() => window.removeEventListener('resize', closeMoreMenu));
type View = 'all' | 'Astro' | 'Next.js' | 'WordPress';
defineProps<{
  tabs: Array<{ label: string; value: View }>;
  counts: Record<View, number>;
  active: View;
  activeManager: string;
  collapsed?: boolean;
  mobile?: boolean;
}>();
const emit = defineEmits<{
  select: [value: View];
  manage: [value: 'resources' | 'adsense' | 'notifications'];
  collapse: [];
  close: [];
  backup: [];
  logout: [];
}>();
</script>

<style scoped src="../styles/home/navigation.css"></style>
