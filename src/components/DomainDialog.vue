<template>
    <el-dialog v-model="dialogVisible" :title="isEdit ? '修改域名' : '新建域名'" width="600px">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" label-position="right">
            <el-form-item label="域名" prop="domain"><el-input v-model="form.domain" placeholder="请输入域名" id="domain-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="域名商" prop="registrar"><el-input v-model="form.registrar" placeholder="请输入域名商" id="registrar-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="域名商链接" prop="registrar_link"><el-input v-model="form.registrar_link" placeholder="请输入域名商链接" id="registrar-link-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="注册日期" prop="registrar_date"><el-date-picker v-model="form.registrar_date" type="date" placeholder="选择注册日期" value-format="YYYY-MM-DD" id="registrar-date-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="到期日期" prop="expiry_date"><el-date-picker v-model="form.expiry_date" type="date" placeholder="选择到期日期" value-format="YYYY-MM-DD" id="expiry-date-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="服务类型" prop="service_type"><el-select v-model="form.service_type" placeholder="请选择服务类型" id="service-type-input" autocomplete="off" clearable><el-option label="伪装网站" value="伪装网站" /><el-option label="正常网站" value="正常网站" /><el-option label="其他" value="其他" /></el-select></el-form-item>
            <el-form-item label="状态" prop="status"><el-select v-model="form.status" placeholder="请选择状态" id="status-input" autocomplete="off" clearable><el-option label="在线" value="在线" /><el-option label="离线" value="离线" /></el-select></el-form-item>
            <el-form-item label="AdSense账号"><el-select v-model="form.adsense_account_id" placeholder="选择关联账号" clearable id="adsense-account-input"><el-option v-for="account in accounts" :key="account.id" :label="`${account.name} · ${account.owner}`" :value="account.id || 0" /></el-select></el-form-item>
            <el-form-item label="网站AdSense" prop="adsense_connected"><el-select v-model="form.adsense_connected" id="adsense-connected-input"><el-option label="未知" value="未知" /><el-option label="已开通" value="已开通" /><el-option label="未开通" value="未开通" /></el-select></el-form-item>
            <el-form-item label="开通日期" prop="adsense_opened_date"><el-date-picker v-model="form.adsense_opened_date" type="date" placeholder="已开通时选择日期" value-format="YYYY-MM-DD" id="adsense-opened-date-input" clearable /></el-form-item>
            <el-form-item label="TG通知"><el-switch v-model="form.tgsend" :active-value="1" :inactive-value="0" inline-prompt active-text="开启" inactive-text="关闭" id="tgsend-input" /></el-form-item>
            <el-form-item label="状态通知"><el-switch v-model="form.st_tgsend" :active-value="1" :inactive-value="0" inline-prompt active-text="开启" inactive-text="关闭" id="st-tgsend-input" /></el-form-item>
            <el-form-item label="日点击次数"><el-input-number v-model="form.daily_clicks" :min="0" :precision="0" :step="1" controls-position="right" placeholder="可留空" /></el-form-item>
            <el-form-item label="SEO记录"><el-checkbox v-model="optimizeToday">今天已优化（提交后记录今天）</el-checkbox><span v-if="form.seo_last_date" class="form-hint">最近：{{ form.seo_last_date }}</span></el-form-item>
            <el-form-item label="备注" prop="memo"><el-input v-model="form.memo" type="textarea" :rows="3" placeholder="请输入备注" id="memo-input" autocomplete="off" clearable /></el-form-item>
        </el-form>
        <template #footer><span class="dialog-footer"><el-button @click="handleCancel">取消</el-button><el-button type="primary" @click="handleSubmit">确定</el-button></span></template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits, watch, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { DomainData } from '../api/domains'
interface AdsenseAccountOption { id?: number; name: string; owner: string }
interface DomainForm extends Omit<DomainData, 'adsense_account_id' | 'adsense_opened_date' | 'seo_last_date' | 'daily_clicks' | 'clicks_updated_date' | 'last_status_check_at'> { adsense_account_id?: number; adsense_opened_date?: string; seo_last_date?: string; daily_clicks?: number; clicks_updated_date?: string | null; last_status_check_at?: string | null }
const props = defineProps<{ visible: boolean; isEdit: boolean; editData?: DomainData; accounts: AdsenseAccountOption[] }>()
const emit = defineEmits(['update:visible', 'submit'])
const dialogVisible = ref(props.visible)
const formRef = ref<FormInstance>()
const optimizeToday = ref(false)
const defaultForm: DomainForm = { domain: '', registrar: '', registrar_link: '', registrar_date: '', expiry_date: '', service_type: '伪装网站', status: '在线', tgsend: 0, st_tgsend: 1, memo: '', adsense_account_id: undefined, adsense_connected: '未知', adsense_opened_date: '', seo_last_date: '', daily_clicks: undefined, clicks_updated_date: null, last_status_check_at: null, resource_status: '未检查' }
const form = ref<DomainForm>({ ...defaultForm })
const rules = computed<FormRules>(() => ({
    domain: [{ required: true, message: '请输入域名', trigger: ['blur'] }, { pattern: /^(?=^.{3,255}$)[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/, message: '请输入正确的域名格式', trigger: ['blur'] }],
    registrar: [{ required: true, message: '请输入域名商', trigger: ['blur'] }], registrar_date: [{ required: true, message: '请选择注册日期', trigger: ['change'] }], expiry_date: [{ required: true, message: '请选择到期日期', trigger: ['change'] }], service_type: [{ required: true, message: '请选择服务类型', trigger: ['change'] }], status: [{ required: true, message: '请选择状态', trigger: ['change'] }],
    adsense_connected: [{ validator: (_rule, value, callback) => value === '已开通' && !form.value.adsense_opened_date ? callback(new Error('已开通时必须选择开通日期')) : callback(), trigger: ['change'] }]
}))
watch(() => props.visible, value => { dialogVisible.value = value; if (value && !props.isEdit) { form.value = { ...defaultForm }; optimizeToday.value = false } })
watch(dialogVisible, value => { emit('update:visible', value); if (!value) formRef.value?.resetFields() })
watch(() => props.editData, value => { if (value) { form.value = { ...defaultForm, ...value, adsense_account_id: value.adsense_account_id || undefined, adsense_opened_date: value.adsense_opened_date || '', seo_last_date: value.seo_last_date || '', daily_clicks: value.daily_clicks ?? undefined } as DomainForm; optimizeToday.value = false } }, { immediate: true })
const handleCancel = () => { dialogVisible.value = false; formRef.value?.resetFields() }
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const handleSubmit = async () => { if (!formRef.value) return; await formRef.value.validate((valid, fields) => { if (!valid) { console.error('表单验证失败:', fields); return }; const payload = { ...form.value, adsense_account_id: form.value.adsense_account_id || null, adsense_opened_date: form.value.adsense_opened_date || null, seo_last_date: optimizeToday.value ? localDate() : (form.value.seo_last_date || null), daily_clicks: form.value.daily_clicks ?? null, clicks_updated_date: form.value.daily_clicks === null || form.value.daily_clicks === undefined ? null : localDate() }; emit('submit', payload); dialogVisible.value = false }) }
</script>
<style scoped>
.form-hint { margin-left: 8px; color: var(--color-muted); font-size: var(--text-sm); }
</style>
