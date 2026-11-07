<template><div class="workspace-page"><WorkspaceHeading title="数据管理" subtitle="网站组合备份、历史记录与 Excel 导出" /><ImportPanel /><section class="page-panel"><h2>导出与备份</h2><p class="page-muted">JSON 包含网站、域名、任务、收入、投入、资源和提示词记录，可重新导入。JSON 和 Excel 均不包含密码、Token 或密钥；完整数据库备份需另行保存。</p><div class="page-actions"><el-button :loading="busy === 'excel'" :disabled="!!busy" @click="download('excel')">导出完整 Excel</el-button><el-button :loading="busy === 'json'" :disabled="!!busy" @click="download('json')">导出网站组合 JSON</el-button></div></section></div></template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import ImportPanel from '../components/ImportPanel.vue'
import { downloadExcel, downloadJsonBackup } from '../utils/downloads'
const busy = ref('')
const download = async (kind: string) => { if (busy.value) return; busy.value = kind; try { await (kind === 'excel' ? downloadExcel() : downloadJsonBackup()); ElMessage.success('导出成功') } catch (e) { ElMessage.error(e instanceof Error ? e.message : '导出失败') } finally { busy.value = '' } }
</script>
