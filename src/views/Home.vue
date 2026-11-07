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
          <article v-for="(site, index) in grouped[stage]" :key="site.id" class="portfolio-row">
            <div class="portfolio-identity">
              <button class="portfolio-site-name" :aria-label="`查看网站：${site.name}`" @click="openSite(site)">{{ site.name }}</button>
              <div class="portfolio-domains">
                <a v-for="domain in site.domains" :key="domain.id" :href="`https://${domain.domain}`" target="_blank" rel="noopener noreferrer">{{ domain.domain }}<span v-if="domain.is_primary"> · 主域</span></a>
              </div>
            </div>
            <div class="portfolio-stage-control"><el-select :model-value="site.stage" aria-label="网站阶段" @change="value => saveSite(site, { stage: value })"><el-option v-for="item in stages" :key="item" :value="item" :label="item" /></el-select></div>
            <div class="portfolio-signals">
              <span>{{ site.platform === '其他' ? site.platform_other || '其他技术栈' : site.platform }}</span>
              <span>{{ site.ownership }}</span>
              <span>{{ site.industry || '类型未记录' }}</span>
              <span>AdSense {{ site.adsense_connected }}</span>
              <span>GSC {{ site.gsc_connected }}</span>
              <span v-if="clickLabel(site)">日点击 {{ clickLabel(site) }}</span>
              <span v-for="income in site.current_income || []" :key="`${income.source}-${income.currency}`">本月 {{ income.currency }} {{ Number(income.amount).toFixed(2) }}</span>
              <span v-if="site.latest_effort">最近一周 {{ Number(site.latest_effort.hours).toFixed(1) }} 小时</span>
            </div>
            <div class="portfolio-action"><span class="portfolio-label">下一步</span><strong>{{ site.next_action || '未设置' }}</strong><small>状态 {{ site.next_action_status }}<template v-if="site.next_action_due_date"> · 截止 {{ site.next_action_due_date }}</template></small><small v-if="site.potential" class="portfolio-potential">潜力：{{ site.potential }}</small></div>
            <div class="portfolio-task-counts"><span>待办 {{ site.open_task_count || 0 }}</span><span>复查 {{ site.review_count || 0 }}</span></div>
            <div class="portfolio-priority"><el-button text :icon="ArrowUp" :disabled="index === 0" :aria-label="`提高优先级：${site.name}`" @click="move(site, -1)" /><el-button text :icon="ArrowDown" :disabled="index === grouped[stage].length - 1" :aria-label="`降低优先级：${site.name}`" @click="move(site, 1)" /></div>
          </article>
        </div>
        <p v-else class="portfolio-empty">此阶段暂无网站。</p>
      </section>
      <section v-if="!websites.length" class="portfolio-empty">还没有网站，先新增一个网站和域名。</section>
      <section v-else-if="!websites.some(site => site.lifecycle === 'active')" class="portfolio-empty">当前没有经营中的网站，可在“停止经营”中恢复网站。</section>
    </template>
    <section v-else class="portfolio-stage" aria-label="停止经营网站">
      <header class="portfolio-stage-heading"><h2>停止经营</h2><span>{{ stoppedSites.length }}</span></header>
      <div v-if="stoppedSites.length" class="portfolio-list">
        <article v-for="site in stoppedSites" :key="site.id" class="portfolio-row">
          <div class="portfolio-identity"><button class="portfolio-site-name" :aria-label="`查看网站：${site.name}`" @click="openSite(site)">{{ site.name }}</button><div class="portfolio-domains"><span v-for="domain in site.domains" :key="domain.id">{{ domain.domain }}</span></div></div>
          <span class="portfolio-stopped-stage">{{ site.stage }}</span>
          <el-button @click="saveSite(site, { lifecycle: 'active' })">恢复经营</el-button>
          <el-button text type="danger" @click="removeSite(site)">删除网站</el-button>
        </article>
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
