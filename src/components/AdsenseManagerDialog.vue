<template>
  <el-dialog v-model="visibleModel" title="AdSense 管理" width="720px" :close-on-click-modal="false">
    <div class="adsense-manager">
      <div class="manager-toolbar"><span>账号与月收入</span><div class="manager-actions"><el-button @click="exportIncome">导出收入</el-button><el-button type="primary" @click="editing = undefined; accountForm = emptyAccount">新增账号</el-button></div></div>
      <el-form v-if="editing !== null" :model="accountForm" label-width="90px" class="account-form">
        <el-form-item label="账号名称"><el-input v-model="accountForm.name" placeholder="例如：主账号" /></el-form-item>
        <el-form-item label="归属人"><el-input v-model="accountForm.owner" placeholder="例如：自己" /></el-form-item>
        <el-form-item label="Publisher ID"><el-input v-model="accountForm.publisher_id" placeholder="例如：pub-xxxxxxxxxxxxxxxx" /></el-form-item>
        <el-form-item label="货币"><el-select v-model="accountForm.currency"><el-option label="USD" value="USD" /><el-option label="CNY" value="CNY" /><el-option label="EUR" value="EUR" /><el-option label="其他" value="OTHER" /></el-select></el-form-item>
        <el-form-item label="账号状态"><el-select v-model="accountForm.status"><el-option label="正常" value="正常" /><el-option label="暂停" value="暂停" /><el-option label="未知" value="未知" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="accountForm.memo" clearable /></el-form-item>
        <div class="dialog-footer"><el-button @click="editing = null">取消</el-button><el-button type="primary" @click="saveAccount">保存账号</el-button></div>
      </el-form>
      <el-table v-else :data="accounts" size="small">
        <el-table-column prop="name" label="账号" min-width="130" />
        <el-table-column prop="owner" label="归属人" min-width="90" />
        <el-table-column prop="publisher_id" label="Publisher ID" min-width="180" />
        <el-table-column prop="currency" label="货币" width="80" />
        <el-table-column prop="status" label="状态" width="80" />
        <el-table-column prop="linked_domains" label="网站数" width="80" /><el-table-column prop="current_income" label="本月收入" width="100" />
        <el-table-column label="操作" width="200"><template #default="scope"><el-button text @click="startEdit(scope.row)">编辑</el-button><el-button text @click="openIncome(scope.row)">月收入</el-button><el-button text type="warning" @click="disableAccount(scope.row)" :disabled="scope.row.status === '暂停'">停用</el-button></template></el-table-column>
      </el-table>
      <div v-if="incomeAccount" class="income-panel">
        <h3>{{ incomeAccount.name }} · 月收入</h3>
        <div v-if="incomeError" class="income-error" role="alert">{{ incomeError }}</div>
        <div class="income-entry"><el-input v-model="incomeMonth" type="month" /><el-input-number v-model="incomeAmount" :min="0" :precision="2" /><el-button type="primary" @click="saveIncome">保存</el-button></div>
        <el-table :data="incomeRows" size="small"><el-table-column prop="income_month" label="月份" /><el-table-column prop="amount" label="金额" /><el-table-column prop="memo" label="备注" /></el-table>
      </div>
    </div>
    <template #footer><span class="dialog-footer"><el-button @click="visibleModel = false">关闭</el-button></span></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../utils/request'
import { confirmAction, isDismissed } from '../utils/feedback'
interface Account { id?: number; name: string; owner: string; publisher_id?: string | null; currency: string; status: string; memo: string; linked_domains?: number; current_income?: number }
interface Income { id?: number; adsense_account_id: number; income_month: string; amount: number; memo: string }
const props = defineProps<{ visible: boolean; accounts: Account[] }>()
const emit = defineEmits(['update:visible', 'changed'])
const visibleModel = computed({ get: () => props.visible, set: value => emit('update:visible', value) })
const emptyAccount = { name: '', owner: '', publisher_id: '', currency: 'USD', status: '未知', memo: '' }
const accountForm = ref({ ...emptyAccount }); const editing = ref<Account | undefined | null>(null)
const localMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())
const incomeAccount = ref<Account>(); const incomeRows = ref<Income[]>([]); const incomeMonth = ref(localMonth()); const incomeAmount = ref(0)
const incomeError = ref('')
const exportIncome = async () => { try { const download = await api.download('/api/adsense/income/export'); const url = URL.createObjectURL(download.blob); const link = document.createElement('a'); link.href = url; link.download = download.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'adsense-income.json'; link.click(); URL.revokeObjectURL(url) } catch (error) { ElMessage.error(error instanceof Error ? error.message : '收入导出失败') } }
watch(() => props.visible, value => { if (value) { editing.value = null; incomeAccount.value = undefined } })
const startEdit = (account: Account) => { editing.value = account; accountForm.value = { name: account.name, owner: account.owner, publisher_id: account.publisher_id || '', currency: account.currency, status: account.status, memo: account.memo || '' } }
const saveAccount = async () => { try { const id = editing.value?.id; await (id ? api.put(`/api/adsense/accounts/${id}`, accountForm.value) : api.post('/api/adsense/accounts', accountForm.value)); ElMessage.success('账号已保存'); editing.value = null; emit('changed') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '账号保存失败') } }
const disableAccount = async (account: Account) => { try { await confirmAction(`停用“${account.name}”？停用不会删除网站关联或收入记录。`, '停用账号', { confirmButtonText: '停用' }); await api.post(`/api/adsense/accounts/${account.id}/disable`); emit('changed') } catch (error) { if (!isDismissed(error)) ElMessage.error(error instanceof Error ? error.message : '停用失败') } }
const openIncome = async (account: Account) => { incomeAccount.value = account; incomeRows.value = []; incomeError.value = ''; try { incomeRows.value = await api.get<Income[]>(`/api/adsense/income?account_id=${account.id}`) } catch (error) { incomeError.value = error instanceof Error ? error.message : '收入记录读取失败'; ElMessage.error(incomeError.value) } }
const saveIncome = async () => { if (!incomeAccount.value?.id) return; try { await api.post('/api/adsense/income', { adsense_account_id: incomeAccount.value.id, income_month: incomeMonth.value, amount: incomeAmount.value, memo: '' }); await openIncome(incomeAccount.value); emit('changed'); ElMessage.success('收入已保存') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '收入保存失败') } }
</script>
<style scoped src="../styles/dialogs/adsense.css"></style>
