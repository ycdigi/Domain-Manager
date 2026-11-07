<template>
  <div class="home-container portfolio-page">
    <WorkspaceHeading title="网站组合" subtitle="按经营阶段查看网站、收入、投入与待处理工作">
      <el-button :icon="Refresh" :loading="loading" aria-label="刷新网站" title="刷新网站" @click="load(true)" />
      <el-button type="primary" :icon="Plus" @click="createVisible = true">新增网站</el-button>
    </WorkspaceHeading>

    <div v-if="error" class="page-error" role="alert"><span>{{ error }}</span><el-button @click="load(true)">重试</el-button></div>
    <div class="portfolio-toolbar">
      <el-input v-model="search" :prefix-icon="Search" clearable placeholder="搜索网站、域名、下一步行动" aria-label="搜索网站" />
      <el-button-group aria-label="网站状态筛选">
        <el-button :type="view === 'active' ? 'primary' : 'default'" @click="view = 'active'">全部网站</el-button>
        <el-button :type="view === 'stopped' ? 'primary' : 'default'" aria-label="停止经营" @click="view = 'stopped'">停止经营</el-button>
      </el-button-group>
    </div>

    <div v-if="loading && !websites.length" class="portfolio-empty">正在加载网站…</div>
    <template v-else-if="view === 'active'">
      <section v-for="stage in visibleStages" :key="stage" class="portfolio-stage" :aria-label="stage">
        <header class="portfolio-stage-heading"><h2>{{ stage }}</h2><span>{{ grouped[stage].length }}</span></header>
        <div v-if="grouped[stage].length" class="portfolio-list">
          <div class="portfolio-table-wrap">
            <table class="portfolio-table" :class="`portfolio-table-${scenarioFor(stage)}`">
              <thead><tr><th v-for="column in columnsFor(stage)" :key="column.key" :class="column.class" :style="{ width: `${column.width}px` }">{{ column.label }}</th></tr></thead>
              <tbody>
                <tr v-for="(site, index) in grouped[stage]" :key="site.id" class="portfolio-row">
                  <td v-for="column in columnsFor(stage)" :key="column.key" :class="column.class">
                    <div v-if="column.key === 'identity'" class="portfolio-identity">
                      <span class="portfolio-site-status" :class="primaryDomain(site)?.status === '在线' ? 'is-online' : primaryDomain(site)?.status === '离线' ? 'is-offline' : 'is-unknown'" :title="primaryDomain(site)?.status || '未检查'" aria-hidden="true"></span>
                      <button class="portfolio-site-name" :aria-label="`查看网站：${site.name}`" @click="openSite(site)">{{ site.name }}</button>
                      <a v-if="primaryDomain(site)" class="portfolio-primary-domain" :href="`https://${primaryDomain(site)!.domain}`" target="_blank" rel="noopener noreferrer">{{ primaryDomain(site)!.domain }}</a>
                      <small v-if="site.domains.length > 1" class="portfolio-domain-count">{{ site.domains.length }} 个域名</small>
                    </div>
                    <span v-else-if="column.key === 'platform'" class="portfolio-platform">{{ platformLabel(site) }}</span>
                    <el-select v-else-if="column.key === 'ownership'" size="small" :model-value="site.ownership" aria-label="网站归属" @change="value => saveSite(site, { ownership: value })"><el-option v-for="item in ownershipOptions" :key="item" :value="item" :label="item" /></el-select>
                    <el-select v-else-if="column.key === 'industry'" size="small" :model-value="site.industry || '其他'" aria-label="网站类型" @change="value => saveSite(site, { industry: value })"><el-option v-for="item in industryOptions" :key="item" :value="item" :label="item" /></el-select>
                    <div v-else-if="column.key === 'clicks'" class="portfolio-number-cell"><strong>{{ clickLabel(site) || '未填写' }}</strong><small>{{ site.clicks_updated_date || '日期未记录' }}</small></div>
                    <el-select v-else-if="column.key === 'adsense'" size="small" :model-value="site.adsense_connected" aria-label="AdSense 状态" @change="value => saveSite(site, { adsense_connected: value })"><el-option v-for="item in serviceStates" :key="item" :value="item" :label="item" /></el-select>
                    <el-select v-else-if="column.key === 'gsc'" size="small" :model-value="site.gsc_connected" aria-label="GSC 状态" @change="value => saveSite(site, { gsc_connected: value })"><el-option v-for="item in serviceStates" :key="item" :value="item" :label="item" /></el-select>
                    <div v-else-if="column.key === 'income'" class="portfolio-money-cell"><span v-for="income in site.current_income || []" :key="`${income.source}-${income.currency}`" :title="income.source">{{ income.currency }} {{ Number(income.amount).toFixed(2) }}</span><small v-if="!(site.current_income || []).length">未细化</small></div>
                    <div v-else-if="column.key === 'effort'" class="portfolio-number-cell"><strong>{{ site.latest_effort ? `${Number(site.latest_effort.hours).toFixed(1)} 小时` : '未记录' }}</strong><small v-if="site.latest_effort">{{ site.latest_effort.week_start }} 起</small></div>
                    <span v-else-if="column.key === 'resources'" class="portfolio-resource-cell">{{ site.resource_names || '未关联' }}</span>
                    <div v-else-if="column.key === 'expiry'" class="portfolio-expiry-cell"><strong>{{ primaryDomain(site)?.expiry_date || '未填写' }}</strong><small v-if="primaryDomain(site)">{{ primaryDomain(site)!.status }}</small></div>
                    <span v-else-if="column.key === 'computer'" class="portfolio-computer-cell">{{ primaryDomain(site)?.computer_name || '未选择' }}</span>
                    <div v-else-if="column.key === 'next_action'" class="portfolio-next-cell"><strong>{{ site.next_action || '未设置' }}</strong><small>{{ site.next_action_status }}<template v-if="site.next_action_due_date"> · {{ site.next_action_due_date }}</template></small><small v-if="site.open_task_count || site.review_count">待办 {{ site.open_task_count || 0 }} · 复查 {{ site.review_count || 0 }}</small></div>
                    <div v-else-if="column.key === 'tasks'" class="portfolio-number-cell"><strong>待办 {{ site.open_task_count || 0 }}</strong><small>复查 {{ site.review_count || 0 }}</small></div>
                    <div v-else-if="column.key === 'potential'" class="portfolio-potential-cell">{{ site.potential || '未记录' }}</div>
                    <div v-else-if="column.key === 'domain_status'" class="portfolio-domain-status-cell"><strong>{{ primaryDomain(site)?.status || '未检查' }}</strong><small>{{ primaryDomain(site)?.last_status_check_at || '无检测时间' }}</small></div>
                    <div v-else-if="column.key === 'stage'" class="portfolio-stage-cell"><el-select size="small" :model-value="site.stage" aria-label="网站阶段" @change="value => saveSite(site, { stage: value })"><el-option v-for="item in stages" :key="item" :value="item" :label="item" /></el-select></div>
                    <div v-else-if="column.key === 'actions'" class="portfolio-actions-cell"><el-select v-if="scenarioFor(stage) !== 'all'" size="small" :model-value="site.stage" aria-label="网站阶段" @change="value => saveSite(site, { stage: value })"><el-option v-for="item in stages" :key="item" :value="item" :label="item" /></el-select><el-button text :icon="ArrowUp" :disabled="index === 0" :aria-label="`提高优先级：${site.name}`" @click="move(site, -1)" /><el-button text :icon="ArrowDown" :disabled="index === grouped[stage].length - 1" :aria-label="`降低优先级：${site.name}`" @click="move(site, 1)" /></div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-else class="portfolio-empty">此阶段暂无网站。</p>
      </section>
      <section v-if="!websites.length" class="portfolio-empty">还没有网站，先新增一个网站和域名。</section>
      <section v-else-if="!websites.some(site => site.lifecycle === 'active')" class="portfolio-empty">当前没有经营中的网站，可在“停止经营”中恢复网站。</section>
    </template>
    <section v-else class="portfolio-stage" aria-label="停止经营网站">
      <header class="portfolio-stage-heading"><h2>停止经营</h2><span>{{ stoppedSites.length }}</span></header>
      <div v-if="stoppedSites.length" class="portfolio-list">
        <div class="portfolio-table-wrap">
          <table class="portfolio-table portfolio-stopped-table"><thead><tr><th class="portfolio-site-column">网站 / 主域名</th><th>原阶段</th><th>技术栈</th><th>归属</th><th>到期日期</th><th>电脑</th><th>操作</th></tr></thead><tbody><tr v-for="site in stoppedSites" :key="site.id" class="portfolio-row"><td class="portfolio-site-column"><div class="portfolio-identity"><button class="portfolio-site-name" :aria-label="`查看网站：${site.name}`" @click="openSite(site)">{{ site.name }}</button><a v-if="primaryDomain(site)" class="portfolio-primary-domain" :href="`https://${primaryDomain(site)!.domain}`" target="_blank" rel="noopener noreferrer">{{ primaryDomain(site)!.domain }}</a></div></td><td>{{ site.stage }}</td><td>{{ platformLabel(site) }}</td><td>{{ site.ownership }}</td><td>{{ primaryDomain(site)?.expiry_date || '未填写' }}</td><td>{{ primaryDomain(site)?.computer_name || '未选择' }}</td><td class="portfolio-actions-cell"><el-button size="small" type="primary" @click="saveSite(site, { lifecycle: 'active' })">恢复经营</el-button><el-button size="small" text type="danger" @click="removeSite(site)">删除网站</el-button></td></tr></tbody></table>
        </div>
      </div>
      <p v-else class="portfolio-empty">没有停止经营的网站。</p>
    </section>

    <el-dialog v-model="createVisible" title="新增网站" width="min(560px, 94vw)" destroy-on-close>
      <el-form label-position="top" @submit.prevent="createSite">
        <el-form-item label="网站名称" required><el-input v-model="newSite.name" maxlength="200" /></el-form-item>
        <el-form-item label="主域名" required><el-input v-model="newSite.domain" placeholder="example.com" /></el-form-item>
        <div class="portfolio-domain-form-grid">
          <el-form-item label="注册商" required><el-input v-model="newSite.registrar" /></el-form-item>
          <el-form-item label="服务类型" required><el-input v-model="newSite.service_type" /></el-form-item>
          <el-form-item label="注册日期" required><el-date-picker v-model="newSite.registrar_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
          <el-form-item label="到期日期" required><el-date-picker v-model="newSite.expiry_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        </div>
      </el-form>
      <template #footer><div class="dialog-footer"><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="createSite">创建网站</el-button></div></template>
    </el-dialog>

    <WebsiteDetailDrawer v-model:visible="detailVisible" :website="selected" @changed="load(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, Plus, Refresh, Search } from '@element-plus/icons-vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import WebsiteDetailDrawer from '../components/WebsiteDetailDrawer.vue'
import { confirmAction, isDismissed } from '../utils/feedback'
import { createWebsite, deleteWebsite, getWebsites, updateWebsite, type Website, type WebsiteStage } from '../api/websites'
import '../styles/home/home.css'

const stages: WebsiteStage[] = ['待评估', '验证', '增长', '维护', '暂停']
const ownershipOptions = ['未分类', '自营网站', '企业客户网站'] as const
const industryOptions = ['计算器', '资讯站', '其他'] as const
const serviceStates = ['未知', '已开通', '未开通'] as const
type PortfolioColumnKey = 'identity' | 'platform' | 'ownership' | 'industry' | 'clicks' | 'adsense' | 'gsc' | 'income' | 'effort' | 'resources' | 'expiry' | 'computer' | 'next_action' | 'tasks' | 'potential' | 'domain_status' | 'stage' | 'actions'
type PortfolioColumn = { key: PortfolioColumnKey; label: string; width: number; class?: string }
const route = useRoute(); const router = useRouter()
const websites = ref<Website[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const search = ref('')
const view = computed<'active' | 'stopped'>({ get: () => route.query.view === 'stopped' ? 'stopped' : 'active', set: value => { const query = { ...route.query }; if (value === 'stopped') query.view = 'stopped'; else delete query.view; void router.replace({ query }) } })
const createVisible = ref(false)
const detailVisible = computed({ get: () => Boolean(route.query.site && selected.value), set: value => { if (!value && route.query.site) { const query = { ...route.query }; delete query.site; void router.replace({ query }) } } })
const selected = ref<Website>()
const newSite = reactive({ name: '', domain: '', registrar: '', service_type: '网站', registrar_date: '', expiry_date: '' })
const matchesSearch = (site: Website) => {
  if (route.query.adsense_account && String(site.adsense_account_id) !== String(route.query.adsense_account)) return false
  if (route.query.resource && !(site.resource_ids || []).includes(Number(route.query.resource))) return false
  if (route.query.provider_account && !(site.provider_account_ids || []).includes(Number(route.query.provider_account))) return false
  const query = search.value.trim().toLowerCase()
  return !query || `${site.name} ${site.next_action || ''} ${site.domains.map(domain => domain.domain).join(' ')}`.toLowerCase().includes(query)
}
const clickLabel = (site: Website) => {
  if (site.daily_clicks != null) return String(site.daily_clicks)
  return ({ under10: '10 次以下', '10to29': '10–29', '30to49': '30–49', '50to99': '50–99', over100: '100 次以上' } as Record<string, string>)[site.daily_clicks_range || ''] || ''
}
const primaryDomain = (site: Website) => site.domains.find(domain => domain.is_primary) || site.domains[0]
const platformLabel = (site: Website) => site.platform === '其他' ? site.platform_other || '其他' : site.platform
const scenarioFor = (stage: WebsiteStage) => route.query.stage === stage ? stage : 'all'
const portfolioColumns: Record<string, PortfolioColumn[]> = {
  all: [
    { key: 'identity', label: '网站 / 主域名', width: 240, class: 'portfolio-site-column' },
    { key: 'platform', label: '技术栈', width: 100 },
    { key: 'ownership', label: '网站归属', width: 140 },
    { key: 'industry', label: '类型', width: 100 },
    { key: 'clicks', label: '日点击', width: 115 },
    { key: 'adsense', label: 'AdSense', width: 110 },
    { key: 'income', label: '本月收入', width: 140 },
    { key: 'resources', label: '服务商 / 资源', width: 170 },
    { key: 'expiry', label: '到期日期', width: 125 },
    { key: 'computer', label: '电脑', width: 145 },
    { key: 'next_action', label: '下一步', width: 190 },
    { key: 'stage', label: '阶段', width: 112 },
    { key: 'actions', label: '排序 / 详情', width: 118 }
  ],
  '待评估': [
    { key: 'identity', label: '网站 / 主域名', width: 240, class: 'portfolio-site-column' },
    { key: 'platform', label: '技术栈', width: 115 }, { key: 'ownership', label: '网站归属', width: 145 },
    { key: 'industry', label: '网站类型', width: 115 }, { key: 'adsense', label: 'AdSense', width: 115 },
    { key: 'gsc', label: 'GSC', width: 105 }, { key: 'potential', label: '潜力说明', width: 230 },
    { key: 'expiry', label: '域名到期', width: 130 }, { key: 'next_action', label: '经营下一步', width: 205 },
    { key: 'actions', label: '阶段 / 排序 / 详情', width: 205 }
  ],
  '验证': [
    { key: 'identity', label: '网站 / 主域名', width: 240, class: 'portfolio-site-column' },
    { key: 'industry', label: '网站类型', width: 115 }, { key: 'clicks', label: '日点击 / 更新时间', width: 145 },
    { key: 'gsc', label: 'GSC', width: 105 }, { key: 'adsense', label: 'AdSense', width: 115 },
    { key: 'income', label: '本月收入', width: 150 }, { key: 'tasks', label: '任务 / 复查', width: 120 },
    { key: 'next_action', label: '验证下一步', width: 220 }, { key: 'expiry', label: '域名到期', width: 130 },
    { key: 'actions', label: '阶段 / 排序 / 详情', width: 205 }
  ],
  '增长': [
    { key: 'identity', label: '网站 / 主域名', width: 240, class: 'portfolio-site-column' },
    { key: 'clicks', label: '日点击 / 更新时间', width: 145 }, { key: 'income', label: '本月收入', width: 160 },
    { key: 'effort', label: '最近每周投入', width: 135 }, { key: 'adsense', label: 'AdSense', width: 115 },
    { key: 'tasks', label: '任务 / 复查', width: 125 }, { key: 'resources', label: '服务商 / 资源', width: 190 },
    { key: 'next_action', label: '增长下一步', width: 220 }, { key: 'actions', label: '阶段 / 排序 / 详情', width: 205 }
  ],
  '维护': [
    { key: 'identity', label: '网站 / 主域名', width: 240, class: 'portfolio-site-column' },
    { key: 'next_action', label: '维护事项 / 截止', width: 220 }, { key: 'tasks', label: '待办 / 到期复查', width: 130 },
    { key: 'domain_status', label: '域名状态 / 检测时间', width: 155 }, { key: 'expiry', label: '域名到期', width: 130 },
    { key: 'computer', label: '电脑', width: 155 }, { key: 'clicks', label: '点击 / 更新时间', width: 145 },
    { key: 'resources', label: '服务商 / 资源', width: 185 }, { key: 'actions', label: '阶段 / 排序 / 详情', width: 205 }
  ],
  '暂停': [
    { key: 'identity', label: '网站 / 主域名', width: 240, class: 'portfolio-site-column' },
    { key: 'ownership', label: '网站归属', width: 145 }, { key: 'expiry', label: '域名到期', width: 130 },
    { key: 'domain_status', label: '域名状态 / 检测时间', width: 155 }, { key: 'resources', label: '服务商 / 资源', width: 185 },
    { key: 'potential', label: '潜力 / 暂停原因', width: 230 }, { key: 'actions', label: '阶段 / 排序 / 详情', width: 205 }
  ]
}
const columnsFor = (stage: WebsiteStage) => portfolioColumns[scenarioFor(stage)] || portfolioColumns.all
const stoppedSites = computed(() => websites.value.filter(site => site.lifecycle === 'stopped' && matchesSearch(site)))
const visibleStages = computed(() => stages.filter(stage => !route.query.stage || route.query.stage === stage))
const grouped = computed(() => Object.fromEntries(stages.map(stage => [stage, websites.value.filter(site => site.lifecycle === 'active' && site.stage === stage && matchesSearch(site)).sort((a, b) => a.priority_order - b.priority_order || a.id - b.id)])) as Record<WebsiteStage, Website[]>)
const load = async (force = false) => {
  loading.value = true; error.value = ''
  try { websites.value = await getWebsites(force) }
  catch (e) { error.value = e instanceof Error ? e.message : '网站加载失败' }
  finally { loading.value = false }
}
const saveSite = async (site: Website, fields: Record<string, unknown>) => {
  try { const updated = await updateWebsite(site.id, fields); Object.assign(site, updated); await load(true) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '网站更新失败') }
}
const openSite = (site: Website) => { selected.value = site; void router.push({ query: { ...route.query, site: String(site.id) } }) }
const syncSelectedSite = () => { const id = Number(route.query.site); selected.value = websites.value.find(site => site.id === id) }
const move = async (site: Website, direction: -1 | 1) => {
  const list = grouped.value[site.stage]
  const index = list.findIndex(item => item.id === site.id)
  const other = list[index + direction]
  if (!other) return
  const order = [...list]
  ;[order[index], order[index + direction]] = [order[index + direction], order[index]]
  try {
    for (const [position, item] of order.entries()) await updateWebsite(item.id, { priority_order: position })
    await load(true)
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '优先级保存失败') }
}
const createSite = async () => {
  if (saving.value) return
  saving.value = true
  try {
    await createWebsite({ name: newSite.name, stage: '待评估', domain: { domain: newSite.domain, registrar: newSite.registrar, registrar_date: newSite.registrar_date, expiry_date: newSite.expiry_date, service_type: newSite.service_type } })
    createVisible.value = false; Object.assign(newSite, { name: '', domain: '', registrar: '', service_type: '网站', registrar_date: '', expiry_date: '' }); await load(true); ElMessage.success('网站已创建')
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '网站创建失败') }
  finally { saving.value = false }
}
const removeSite = async (site: Website) => {
  try { await confirmAction(`删除“${site.name}”及其网站、域名、任务和历史数据？`, '删除网站', { confirmButtonText: '删除网站' }); await deleteWebsite(site.id); await load(true); ElMessage.success('网站已删除') }
  catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '网站删除失败') }
}
watch(() => route.query.site, syncSelectedSite)
watch(websites, syncSelectedSite)
onActivated(() => { void load(true) })
</script>
