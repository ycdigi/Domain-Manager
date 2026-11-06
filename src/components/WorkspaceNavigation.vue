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
        <p v-if="!collapsed" class="workspace-nav-label">网站归属</p>
        <button v-for="tab in ownershipTabs" :key="tab.value" type="button" class="workspace-nav-item" :class="{ 'is-active': activeOwnership === tab.value }" :aria-pressed="activeOwnership === tab.value" :aria-label="tab.label" :title="`${tab.label} · ${ownershipCounts[tab.value]} 个网站`" @click="emit('selectOwnership', tab.value)">
          <el-icon aria-hidden="true"><Grid v-if="tab.value === 'all'" /><House v-else-if="tab.value === '自营网站'" /><OfficeBuilding v-else-if="tab.value === '企业客户网站'" /><QuestionFilled v-else /></el-icon>
          <span v-if="!collapsed" class="workspace-nav-text">{{ tab.label }}</span>
          <span v-if="!collapsed" class="workspace-nav-count" aria-hidden="true">{{ ownershipCounts[tab.value] }}</span>
        </button>
      </div>
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">技术栈</p>
        <button v-for="tab in tabs" :key="tab.value" type="button" class="workspace-nav-item" :class="{ 'is-active': active === tab.value }" :aria-pressed="active === tab.value" :aria-label="tab.label === '全部' ? '全部技术栈' : tab.label" :title="`${tab.label === '全部' ? '全部技术栈' : tab.label} · ${counts[tab.value]} 个网站`" @click="emit('select', tab.value)">
          <el-icon aria-hidden="true"><Grid v-if="tab.value === 'all'" /><Lightning v-else-if="tab.value === 'Astro'" /><Connection v-else-if="tab.value === 'Next.js'" /><Document v-else /></el-icon>
          <span v-if="!collapsed" class="workspace-nav-text">{{ tab.label === '全部' ? '全部技术栈' : tab.label }}</span>
          <span v-if="!collapsed" class="workspace-nav-count" aria-hidden="true">{{ counts[tab.value] }}</span>
        </button>
      </div>
      <div class="workspace-nav-group">
        <p v-if="!collapsed" class="workspace-nav-label">管理</p>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'resources' }" aria-label="资源管理" title="资源管理" @click="emit('manage', 'resources')"><el-icon aria-hidden="true"><FolderOpened /></el-icon><span v-if="!collapsed" class="workspace-nav-text">资源管理</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'adsense' }" aria-label="AdSense 管理" title="AdSense 管理" @click="emit('manage', 'adsense')"><el-icon aria-hidden="true"><Coin /></el-icon><span v-if="!collapsed" class="workspace-nav-text">AdSense 管理</span></button>
        <button type="button" class="workspace-nav-item" :class="{ 'is-active': activeManager === 'data' }" aria-label="数据管理" title="数据管理" @click="emit('manage', 'data')"><el-icon aria-hidden="true"><Download /></el-icon><span v-if="!collapsed" class="workspace-nav-text">数据管理</span></button>
      </div>
      <div v-if="!collapsed && overviewTotals" class="workspace-nav-group workspace-nav-overview" aria-label="首页概览指标">
        <p class="workspace-nav-label">首页概览</p>
        <div class="workspace-nav-metrics">
          <div><span>临期域名</span><strong>{{ overviewTotals.expiring_domains }}</strong></div>
          <div><span>WP</span><strong>{{ overviewTotals.excellent_wordpress }}</strong></div>
          <div><span>Astro</span><strong>{{ overviewTotals.excellent_astro }}</strong></div>
          <div><span>Next.js</span><strong>{{ overviewTotals.excellent_nextjs }}</strong></div>
        </div>
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
import type { SiteOwnership } from '../../shared/website-classification';
import { House, OfficeBuilding, QuestionFilled, Grid, Lightning, Connection, Document, FolderOpened, Coin, MoreFilled, Download, Close, Expand, Fold } from '@element-plus/icons-vue';
const moreMenu = ref<DropdownInstance>();
const closeMoreMenu = () => { moreMenu.value?.handleClose(); };
onMounted(() => window.addEventListener('resize', closeMoreMenu));
onUnmounted(() => window.removeEventListener('resize', closeMoreMenu));
type View = 'all' | 'Astro' | 'Next.js' | 'WordPress';
defineProps<{
  ownershipTabs: Array<{ label: string; value: 'all' | SiteOwnership }>;
  ownershipCounts: Record<'all' | SiteOwnership, number>;
  activeOwnership: string;
  tabs: Array<{ label: string; value: View }>;
  counts: Record<View, number>;
  active: string;
  activeManager: string;
  overviewTotals?: { expiring_domains: number; excellent_wordpress: number; excellent_astro: number; excellent_nextjs: number } | null;
  collapsed?: boolean;
  mobile?: boolean;
}>();
const emit = defineEmits<{
  select: [value: View];
  selectOwnership: [value: 'all' | SiteOwnership];
  manage: [value: 'resources' | 'adsense' | 'data'];
  collapse: [];
  close: [];
  backup: [];
  logout: [];
}>();
</script>

<style scoped src="../styles/home/navigation.css"></style>
