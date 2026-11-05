<template>
 <div class="workspace-page">
  <WorkspaceHeading title="AdSense" subtitle="账号、归属人和月收入"><el-button :disabled="loading || saving" @click="load(true)">刷新</el-button><el-button @click="exportIncome">导出收入</el-button><el-button type="primary" @click="editAccount()">新增账号</el-button></WorkspaceHeading>
  <div v-if="error || contextError" class="page-error" role="alert">{{ error || contextError }}<el-button v-if="error" @click="load(true)">重试</el-button><el-button v-else @click="router.push({ name: 'Adsense' })">查看全部账号</el-button></div>
  <section class="page-panel">
   <div class="panel-heading"><div><h2>归属人累计收入</h2><p class="page-muted">汇总所有已记录月份；月份选择只影响选中账号的明细。</p></div><span class="page-muted">{{ ownerTotals.length }} 位归属人</span></div>
   <el-table v-if="ownerTotals.length" :data="ownerTotals" size="small" class="owner-summary-table">
    <el-table-column prop="owner" label="归属人" min-width="120" />
    <el-table-column label="累计 USD" min-width="120"><template #default="scope">USD {{ scope.row.usd.toFixed(2) }}</template></el-table-column>
    <el-table-column label="累计人民币" min-width="130"><template #default="scope">{{ scope.row.cny == null ? '未记录' : `CNY ${scope.row.cny.toFixed(2)}` }}</template></el-table-column>
    <el-table-column prop="siteCount" label="站点数量" min-width="100" />
    <el-table-column label="最早开通日期" min-width="130"><template #default="scope">{{ scope.row.openedDate || '未记录' }}</template></el-table-column>
   </el-table>
   <p v-else class="page-muted">暂无 AdSense 账号收入。</p>
  </section>
  <section v-if="editing" class="page-panel">
   <div class="panel-heading"><h2>{{ editingId ? `编辑账号：${selected?.name || accountForm.name}` : '新增 AdSense 账号' }}</h2></div>
   <el-form class="page-form page-form-grid" label-position="top" :model="accountForm" @submit.prevent="saveAccount">
    <el-form-item label="账号名称" required><el-input v-model="accountForm.name" maxlength="200" /></el-form-item><el-form-item label="归属人" required><el-input v-model="accountForm.owner" maxlength="200" /></el-form-item>
    <el-form-item label="Publisher ID"><el-input v-model="accountForm.publisher_id" placeholder="pub-xxxxxxxxxxxxxxxx" /></el-form-item><el-form-item label="账号开通日期"><el-date-picker v-model="accountForm.opened_date" type="date" value-format="YYYY-MM-DD" clearable /></el-form-item>
    <el-form-item label="货币"><el-select v-model="accountForm.currency"><el-option v-for="currency in ['USD','CNY','EUR','OTHER']" :key="currency" :label="currency" :value="currency" /></el-select></el-form-item>
    <el-form-item label="账号状态"><el-select v-model="accountForm.status"><el-option v-for="status in ['正常','暂停','未知']" :key="status" :label="status" :value="status" /></el-select></el-form-item>
    <el-form-item label="备注"><el-input v-model="accountForm.memo" /></el-form-item>
    <div class="page-actions page-form-full"><el-button :disabled="saving" @click="cancelEdit">取消编辑</el-button><el-button type="primary" :loading="saving" native-type="submit">保存账号</el-button></div>
   </el-form>
  </section>
  <div class="page-columns">
   <section class="page-panel" v-loading="loading"><div class="panel-heading"><h2>账号列表</h2><span class="page-muted">{{ accounts.length }} 个账号</span></div>
    <ul class="page-list"><li v-for="account in accounts" :key="account.id"><div><button type="button" class="page-link" :aria-current="selected?.id === account.id ? 'true' : undefined" @click="selectAccount(account.id)">{{ account.name }}</button><p class="page-muted">{{ account.owner }} · {{ account.publisher_id || '未记录 Publisher ID' }}</p><span class="page-muted">{{ account.status }} · 账号货币 {{ account.currency }} · 累计 USD {{ Number(account.income_usd_total || 0).toFixed(2) }} · 累计 CNY {{ account.income_cny_total == null ? '未记录' : Number(account.income_cny_total).toFixed(2) }} · 开通 {{ account.opened_date || '未记录' }}</span></div><button type="button" class="page-link" @click="showSites(account.id)">{{ account.linked_domains || 0 }} 个网站</button></li></ul><p v-if="!loading && !accounts.length" class="page-empty">还没有 AdSense 账号。</p>
   </section>
   <section class="page-panel">
    <template v-if="selected">
     <div class="panel-heading"><div><h2>{{ selected.name }}</h2><p class="page-muted">{{ selected.owner }} · {{ selected.publisher_id || '未记录 Publisher ID' }} · {{ selected.currency }}</p></div><div class="page-actions"><el-button :disabled="saving" @click="editAccount(selected)">编辑账号</el-button><el-button type="warning" :disabled="saving || selected.status === '暂停'" @click="disableAccount">停用</el-button></div></div>
     <div class="panel-heading"><h2 class="income-heading"><select id="income-month-history" class="income-heading-month native-month-select" :value="month" :disabled="incomeLoading" @change="changeMonthFromEvent"><option v-for="option in monthOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select><span>月收入</span></h2><span class="page-muted">{{ existingIncome ? '修改已有记录' : '新增该月记录' }}</span></div>
     <div v-if="incomeError" class="page-error" role="alert">{{ incomeError }}<el-button @click="loadIncome(true)">重试</el-button></div>
     <el-form label-position="top" :aria-busy="incomeLoading" @submit.prevent="saveIncome">
      <div class="income-form-grid"><el-form-item label="美元金额（USD）" required><StableNumberInput v-model="incomeForm.amount_usd" :disabled="incomeLoading || !incomeLoaded || !!incomeError || saving" :min="0" :precision="2" :controls="false" /></el-form-item><el-form-item label="人民币金额（CNY，可空）"><StableNumberInput v-model="incomeForm.amount_cny" :disabled="incomeLoading || !incomeLoaded || !!incomeError || saving" :min="0" :precision="2" :controls="false" /></el-form-item><el-form-item label="转账日期（可空）"><el-date-picker v-model="incomeForm.transfer_date" type="date" value-format="YYYY-MM-DD" clearable :disabled="incomeLoading || !incomeLoaded || !!incomeError || saving" /></el-form-item></div>
      <el-form-item label="收入备注"><el-input v-model="incomeForm.memo" :disabled="incomeLoading || !incomeLoaded || !!incomeError || saving" /></el-form-item>
      <section class="income-site-breakdown"><div class="panel-heading"><div><h3>网站美元明细（可选）</h3><p class="page-muted">只有能确认分摊时填写；不填写不会自动分摊账号总额。</p></div><span class="page-muted">{{ linkedSites.length }} 个关联网站</span></div><div v-if="linkedSites.length" class="income-site-list"><div v-for="site in linkedSites" :key="site.id" class="income-site-row"><div><strong>{{ site.site_name || site.domain }}</strong><span>{{ site.domain }}</span></div><StableNumberInput v-model="incomeForm.siteAmounts[String(site.id)]" :disabled="incomeLoading || !incomeLoaded || !!incomeError || saving" :min="0" :precision="2" :controls="false" placeholder="未填写" /></div></div><p v-else class="page-muted">当前账号还没有关联网站。</p></section>
      <div class="page-actions"><el-button type="primary" native-type="submit" :loading="saving" :disabled="incomeLoading || !!incomeError || !incomeLoaded">保存本月收入</el-button><el-button :disabled="!incomeDirty || saving" @click="resetIncome">放弃修改</el-button></div>
     </el-form>
     <h3>收入历史</h3><el-table :data="incomeRows" size="small"><el-table-column prop="income_month" label="月份" min-width="100"><template #default="scope"><button class="page-link" @click="changeMonth(scope.row.income_month)">{{ scope.row.income_month }}</button></template></el-table-column><el-table-column prop="amount_usd" label="美元" min-width="90"><template #default="scope">{{ Number(scope.row.amount_usd || scope.row.amount || 0).toFixed(2) }}</template></el-table-column><el-table-column prop="amount_cny" label="人民币" min-width="90"><template #default="scope">{{ scope.row.amount_cny == null ? '—' : Number(scope.row.amount_cny).toFixed(2) }}</template></el-table-column><el-table-column prop="transfer_date" label="转账日期" min-width="105"><template #default="scope">{{ scope.row.transfer_date || '—' }}</template></el-table-column><el-table-column prop="memo" label="备注" min-width="120" show-overflow-tooltip /></el-table>
     <h3>关联网站</h3><ul class="page-list"><li v-for="site in linkedSites" :key="site.id"><button class="page-link" @click="openSite(site.domain)">{{ site.site_name || site.domain }}</button><span class="page-muted">{{ site.domain }} · {{ site.adsense_connected }}</span></li></ul><p v-if="!linkedSites.length" class="page-muted">没有关联网站。</p>
    </template><p v-else class="page-empty">选择账号，查看月收入与关联网站。</p>
   </section>
  </div>
 </div>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import StableNumberInput from '../components/StableNumberInput.vue'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
import { cachedGet, invalidateData, localMonth, queryText } from '../utils/workspaceCache'
import { api } from '../utils/request'
import { confirmAction, isDismissed } from '../utils/feedback'
import { downloadIncome } from '../utils/downloads'
import type { DomainData } from '../api/domains'
interface Account { id?: number; name: string; owner: string; publisher_id?: string | null; opened_date?: string | null; currency: string; status: string; memo: string; linked_domains?: number; current_income?: number; income_usd_total?: number; income_cny_total?: number | null }
interface Income { id?: number; adsense_account_id: number; income_month: string; amount: number; amount_usd?: number; amount_cny?: number | null; transfer_date?: string | null; memo: string; site_amounts?: Array<{ domain_id: number; amount_usd: number }> }
const route = useRoute(); const router = useRouter()
const month = computed(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(queryText(route.query.month)) ? queryText(route.query.month) : localMonth())
const accounts = ref<Account[]>([]); const sites = ref<DomainData[]>([]); const loading = ref(false); const saving = ref(false); const error = ref('')
const selected = computed(() => accounts.value.find(account => String(account.id) === route.query.account))
const contextError = computed(() => !loading.value && route.query.account && !selected.value ? '指定的 AdSense 账号不存在。' : route.query.month && month.value !== route.query.month ? '月份格式无效，请使用 YYYY-MM。' : '')
const ownerTotals = computed(() => { const totals = new Map<string, { key: string; owner: string; usd: number; cny: number | null; siteCount: number; openedDate: string | null }>(); for (const account of accounts.value) { const key = account.owner.trim() || '未记录'; const item = totals.get(key) || { key, owner: key, usd: 0, cny: null, siteCount: 0, openedDate: null }; item.usd += Number(account.income_usd_total || 0); if (account.income_cny_total != null) item.cny = (item.cny || 0) + Number(account.income_cny_total); item.siteCount += Number(account.linked_domains || 0); if (account.opened_date && (!item.openedDate || account.opened_date < item.openedDate)) item.openedDate = account.opened_date; totals.set(key, item) } return [...totals.values()].sort((a, b) => b.usd - a.usd || a.owner.localeCompare(b.owner)) })
const linkedSites = computed(() => sites.value.filter(site => site.adsense_account_id === selected.value?.id))
const emptyAccount = () => ({ name: '', owner: '', publisher_id: '', opened_date: '', currency: 'USD', status: '未知', memo: '' })
const accountForm = ref(emptyAccount()); const editing = ref(false); const editingId = ref<number>(); const accountBaseline = ref('')
const incomeRows = ref<Income[]>([]); const incomeLoading = ref(false); const incomeLoaded = ref(false); const incomeError = ref(''); const incomeForm = ref<{ amount_usd: number | undefined; amount_cny: number | undefined; transfer_date: string; memo: string; siteAmounts: Record<string, number | undefined> }>({ amount_usd: undefined, amount_cny: undefined, transfer_date: '', memo: '', siteAmounts: {} }); const incomeBaseline = ref('')
const monthOptions = computed(() => { const base = localMonth().split('-').map(Number); const months = new Set<string>(); for (let offset = 0; offset < 6; offset++) { const date = new Date(base[0], base[1] - 1 - offset, 1); months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`) } incomeRows.value.forEach(row => months.add(row.income_month)); return [...months].sort((a, b) => b.localeCompare(a)).map(value => ({ value, label: value === month.value ? `${value}（当前）` : incomeRows.value.some(row => row.income_month === value) ? `${value}（已有记录）` : value })) })
const existingIncome = computed(() => incomeRows.value.find(row => row.income_month === month.value))
const incomeDirty = computed(() => incomeLoaded.value && JSON.stringify(incomeForm.value) !== incomeBaseline.value)
const dirty = computed(() => (editing.value && JSON.stringify(accountForm.value) !== accountBaseline.value) || incomeDirty.value)
const { canDiscard } = useUnsavedChanges(dirty)
let loadVersion = 0; let incomeVersion = 0
const loadIncome = async (force = false) => {
 const version = ++incomeVersion; incomeError.value = ''; incomeLoaded.value = false; incomeRows.value = []; incomeForm.value = { amount_usd: undefined, amount_cny: undefined, transfer_date: '', memo: '', siteAmounts: {} }
 if (!selected.value?.id) { incomeLoading.value = false; return }
 incomeLoading.value = true
 try { const rows = await cachedGet<Income[]>(`/api/adsense/income?account_id=${selected.value.id}`, force); if (version !== incomeVersion) return; incomeRows.value = rows; const row = existingIncome.value; incomeForm.value = { amount_usd: row ? (row.amount_usd || row.amount || 0) : undefined, amount_cny: row?.amount_cny ?? undefined, transfer_date: row?.transfer_date || '', memo: row?.memo || '', siteAmounts: Object.fromEntries((row?.site_amounts || []).map(site => [String(site.domain_id), site.amount_usd])) }; incomeBaseline.value = JSON.stringify(incomeForm.value); incomeLoaded.value = true }
 catch (e) { if (version === incomeVersion) incomeError.value = e instanceof Error ? e.message : '收入读取失败' }
 finally { if (version === incomeVersion) incomeLoading.value = false }
}
const load = async (force = false) => {
 if (force && !(await canDiscard())) return
 const version = ++loadVersion; loading.value = true; error.value = ''
 try { const [data, domains] = await Promise.all([cachedGet<Account[]>('/api/adsense/accounts', force), cachedGet<DomainData[]>('/api/domains')]); if (version !== loadVersion) return; accounts.value = data; sites.value = domains; await loadIncome(force) }
 catch (e) { if (version === loadVersion) error.value = e instanceof Error ? e.message : '账号读取失败' }
 finally { if (version === loadVersion) loading.value = false }
}
watch(() => [route.query.account, route.query.month], () => { editing.value = false; incomeLoaded.value = false; void load() }, { immediate: true })
const selectAccount = (id?: number) => { void router.push({ query: { ...route.query, account: String(id) } }) }
const changeMonth = (value: string) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) void router.push({ query: { ...route.query, month: value } }) }
const changeMonthFromEvent = (event: Event) => changeMonth((event.target as HTMLSelectElement).value)
const showSites = (id?: number) => { void router.push({ name: 'Home', query: { adsense_account: String(id) } }) }
const openSite = (domain: string) => { void router.push({ name: 'Home', query: { site: domain } }) }
const editAccount = async (account?: Account) => { if (!(await canDiscard())) return; editingId.value = account?.id; accountForm.value = account ? { name: account.name, owner: account.owner, publisher_id: account.publisher_id || '', opened_date: account.opened_date || '', currency: account.currency, status: account.status, memo: account.memo || '' } : emptyAccount(); accountBaseline.value = JSON.stringify(accountForm.value); editing.value = true }
const cancelEdit = async () => { if (await canDiscard()) editing.value = false }
const saveAccount = async () => {
 if (saving.value) return
 if (!accountForm.value.name.trim() || !accountForm.value.owner.trim()) { ElMessage.error('账号名称和归属人不能为空'); return }
 saving.value = true
 try { const id = editingId.value; const saved = await (id ? api.put<Account>(`/api/adsense/accounts/${id}`, accountForm.value) : api.post<Account>('/api/adsense/accounts', accountForm.value)); editing.value = false; invalidateData('/api/adsense/accounts', '/api/domains', '/api/dashboard/summary'); await load(); if (saved?.id && String(saved.id) !== route.query.account) await router.replace({ query: { ...route.query, account: String(saved.id) } }); ElMessage.success('账号已保存') }
 catch (e) { ElMessage.error(e instanceof Error ? e.message : '账号保存失败') }
 finally { saving.value = false }
}
const disableAccount = async () => { if (!selected.value?.id || saving.value || !(await canDiscard())) return; try { await confirmAction(`停用“${selected.value.name}”？网站和收入历史会保留。`, '停用账号', { confirmButtonText: '停用' }); saving.value = true; await api.post(`/api/adsense/accounts/${selected.value.id}/disable`); invalidateData('/api/adsense/accounts', '/api/dashboard/summary'); editing.value = false; await load(); } catch (e) { if (!isDismissed(e)) ElMessage.error(e instanceof Error ? e.message : '停用失败') } finally { saving.value = false } }
const resetIncome = async () => { if (await canDiscard()) incomeForm.value = JSON.parse(incomeBaseline.value) }
const saveIncome = async () => {
 if (saving.value || incomeLoading.value || !incomeLoaded.value || !selected.value?.id || incomeError.value) return
 if (incomeForm.value.amount_usd == null || !Number.isFinite(incomeForm.value.amount_usd) || incomeForm.value.amount_usd < 0) { ElMessage.error('请输入非负美元金额'); return }
 saving.value = true
 try { const site_amounts = Object.entries(incomeForm.value.siteAmounts).filter(([, amount]) => amount != null).map(([domain_id, amount_usd]) => ({ domain_id: Number(domain_id), amount_usd })); await api.post('/api/adsense/income', { adsense_account_id: selected.value.id, income_month: month.value, amount_usd: incomeForm.value.amount_usd, amount_cny: incomeForm.value.amount_cny ?? null, transfer_date: incomeForm.value.transfer_date || null, memo: incomeForm.value.memo, site_amounts }); incomeBaseline.value = JSON.stringify(incomeForm.value); invalidateData('/api/adsense/income', '/api/adsense/accounts', '/api/dashboard/summary'); await load(); ElMessage.success('收入已保存') }
 catch (e) { ElMessage.error(e instanceof Error ? e.message : '收入保存失败') }
 finally { saving.value = false }
}
const exportIncome = async () => { try { await downloadIncome() } catch (e) { ElMessage.error(e instanceof Error ? e.message : '导出失败') } }
</script>
