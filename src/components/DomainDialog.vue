<template>
    <el-dialog v-model="dialogVisible" :title="isEdit ? `修改域名 · ${editData?.domain || ''}` : '新建域名'" width="600px" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
        <el-form :disabled="saving" class="domain-edit-form" ref="formRef" :model="form" :rules="rules" label-width="100px" label-position="top">
            <el-form-item label="域名" prop="domain"><el-input v-model="form.domain" placeholder="请输入域名" id="domain-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="网站名称"><el-input v-model="form.site_name" placeholder="例如：电气计算器站" maxlength="200" show-word-limit clearable /></el-form-item>
            <el-form-item label="网站归属关系"><el-select v-model="form.ownership" id="ownership-input" aria-label="网站归属关系"><el-option v-for="ownership in siteOwnerships" :key="ownership" :label="ownership" :value="ownership" /></el-select></el-form-item>
            <el-form-item label="类型"><el-select v-model="form.industry" placeholder="选择类型" clearable><el-option v-for="industry in industryOptions" :key="industry" :label="industry" :value="industry" /></el-select></el-form-item>
            <el-form-item label="域名商" prop="registrar"><el-input v-model="form.registrar" placeholder="请输入域名商" id="registrar-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="域名商链接" prop="registrar_link"><el-input v-model="form.registrar_link" placeholder="请输入域名商链接" id="registrar-link-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="注册日期" prop="registrar_date"><el-date-picker v-model="form.registrar_date" type="date" placeholder="选择注册日期" value-format="YYYY-MM-DD" id="registrar-date-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="到期日期" prop="expiry_date"><el-date-picker v-model="form.expiry_date" type="date" placeholder="选择到期日期" value-format="YYYY-MM-DD" id="expiry-date-input" autocomplete="off" clearable /></el-form-item>
            <el-form-item label="服务类型" prop="service_type"><el-select v-model="form.service_type" placeholder="请选择服务类型" id="service-type-input" autocomplete="off" clearable><el-option label="伪装网站" value="伪装网站" /><el-option label="正常网站" value="正常网站" /><el-option label="其他" value="其他" /></el-select></el-form-item>
            <el-form-item label="技术栈" prop="platform"><el-select v-model="form.platform" placeholder="请选择技术栈" id="platform-input"><el-option label="WordPress" value="WordPress" /><el-option label="Astro" value="Astro" /><el-option label="Next.js" value="Next.js" /><el-option label="其他" value="其他" /></el-select></el-form-item>
            <el-form-item v-if="form.platform === '其他'" label="其他技术栈"><el-input v-model="form.platform_other" placeholder="例如：Nuxt、静态 HTML" clearable /></el-form-item>
            <template v-if="form.platform === 'WordPress'">
                <el-form-item label="计算器页数"><el-input-number v-model="form.wp_calculator_count" :min="0" :precision="0" controls-position="right" placeholder="可留空" /></el-form-item>
                <el-form-item label="文章数"><el-input-number v-model="form.wp_article_count" :min="0" :precision="0" controls-position="right" placeholder="可留空" /></el-form-item>
                <el-form-item label="统计日期" prop="content_stats_updated_date"><el-date-picker v-model="form.content_stats_updated_date" type="date" value-format="YYYY-MM-DD" placeholder="填写数量时必填" clearable /></el-form-item>
            </template>
            <el-form-item label="状态" prop="status"><el-select v-model="form.status" placeholder="请选择状态" id="status-input" autocomplete="off" clearable><el-option label="在线" value="在线" /><el-option label="离线" value="离线" /></el-select></el-form-item>
            <el-form-item label="AdSense账号"><el-select v-model="form.adsense_account_id" placeholder="选择关联账号" clearable id="adsense-account-input"><el-option v-for="account in accounts" :key="account.id" :label="`${account.name} · ${account.owner}`" :value="account.id || 0" /></el-select></el-form-item>
            <el-form-item label="网站AdSense" prop="adsense_connected"><el-select v-model="form.adsense_connected" id="adsense-connected-input"><el-option label="未知" value="未知" /><el-option label="已开通" value="已开通" /><el-option label="未开通" value="未开通" /></el-select></el-form-item>
            <el-form-item label="开通日期" prop="adsense_opened_date"><el-date-picker v-model="form.adsense_opened_date" type="date" placeholder="已开通时选择日期" value-format="YYYY-MM-DD" id="adsense-opened-date-input" clearable /></el-form-item>
            <el-form-item label="TG通知"><el-switch v-model="form.tgsend" :active-value="1" :inactive-value="0" inline-prompt active-text="开启" inactive-text="关闭" id="tgsend-input" /></el-form-item>
            <el-form-item label="状态通知"><el-switch v-model="form.st_tgsend" :active-value="1" :inactive-value="0" inline-prompt active-text="开启" inactive-text="关闭" id="st-tgsend-input" /></el-form-item>
            <el-form-item label="日点击区间"><el-select v-model="form.daily_clicks_range" placeholder="选择日点击区间" clearable><el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" /></el-select></el-form-item>
            <el-form-item label="SEO记录"><el-checkbox v-model="optimizeToday">今天已优化（提交后记录今天）</el-checkbox><span v-if="form.seo_last_date" class="form-hint">最近：{{ form.seo_last_date }}</span></el-form-item>
            <el-form-item label="备注" prop="memo"><el-input v-model="form.memo" type="textarea" :rows="3" placeholder="请输入备注" id="memo-input" autocomplete="off" clearable /></el-form-item>
        </el-form>
        <template #footer><span class="dialog-footer"><el-button :disabled="saving" @click="handleCancel">取消</el-button><el-button type="primary" :loading="saving" @click="handleSubmit">确定</el-button></span></template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { siteOwnerships } from '../../shared/website-classification'
import { clicksDate, contentDate } from '../utils/dataFreshness'
import type { DomainData } from '../api/domains'
interface AdsenseAccountOption { id?: number; name: string; owner: string }
interface DomainForm extends Omit<DomainData, 'adsense_account_id' | 'adsense_opened_date' | 'seo_last_date' | 'daily_clicks' | 'daily_clicks_range' | 'clicks_updated_date' | 'last_status_check_at' | 'platform_other' | 'wp_calculator_count' | 'wp_article_count' | 'content_stats_updated_date' | 'site_name' | 'industry'> { site_name?: string; industry?: string; adsense_account_id?: number; adsense_opened_date?: string; seo_last_date?: string; daily_clicks?: number; daily_clicks_range?: Exclude<DomainData['daily_clicks_range'], null>; clicks_updated_date?: string | null; last_status_check_at?: string | null; platform_other?: string; wp_calculator_count?: number; wp_article_count?: number; content_stats_updated_date?: string }
const props = defineProps<{ saving?: boolean; visible: boolean; isEdit: boolean; editData?: DomainData; accounts: AdsenseAccountOption[] }>()
const emit = defineEmits(['update:visible', 'submit'])
const dialogVisible = ref(props.visible)
const formRef = ref<FormInstance>()
const optimizeToday = ref(false)
const industryOptions = ['计算器', '资讯站', '其他']
const defaultForm: DomainForm = { domain: '', ownership: '自营网站', site_name: '', industry: '', registrar: '', registrar_link: '', registrar_date: '', expiry_date: '', service_type: '伪装网站', platform: '其他', platform_other: '', status: '在线', tgsend: 0, st_tgsend: 1, memo: '', adsense_account_id: undefined, adsense_connected: '未知', adsense_opened_date: '', seo_last_date: '', daily_clicks: undefined, daily_clicks_range: undefined, clicks_updated_date: null, last_status_check_at: null, wp_calculator_count: undefined, wp_article_count: undefined, content_stats_updated_date: '', resource_status: '未检查' }
const form = ref<DomainForm>({ ...defaultForm })
const rules = computed<FormRules>(() => ({
    domain: [{ required: true, message: '请输入域名', trigger: ['blur'] }, { pattern: /^(?=^.{3,255}$)[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/, message: '请输入正确的域名格式', trigger: ['blur'] }],
    registrar: [{ required: true, message: '请输入域名商', trigger: ['blur'] }], registrar_date: [{ required: true, message: '请选择注册日期', trigger: ['change'] }], expiry_date: [{ required: true, message: '请选择到期日期', trigger: ['change'] }], service_type: [{ required: true, message: '请选择服务类型', trigger: ['change'] }], status: [{ required: true, message: '请选择状态', trigger: ['change'] }],
    adsense_connected: [{ validator: (_rule, value, callback) => value === '已开通' && (!form.value.adsense_opened_date || !form.value.adsense_account_id) ? callback(new Error('已开通时必须选择账号和开通日期')) : callback(), trigger: ['change'] }],
    content_stats_updated_date: [{ validator: (_rule, value, callback) => form.value.platform === 'WordPress' && (form.value.wp_calculator_count != null || form.value.wp_article_count != null) && !value ? callback(new Error('填写 WordPress 数量时必须选择统计日期')) : callback(), trigger: ['change'] }]
}))
watch(() => props.visible, value => { dialogVisible.value = value; if (value) { if (props.isEdit && props.editData) setEditData(props.editData); else form.value = { ...defaultForm }; optimizeToday.value = false } })
watch(dialogVisible, value => { emit('update:visible', value); if (!value) formRef.value?.resetFields() })
const setEditData = (value: DomainData) => { form.value = { ...defaultForm, ...value, adsense_account_id: value.adsense_account_id || undefined, adsense_opened_date: value.adsense_opened_date || '', seo_last_date: value.seo_last_date || '', daily_clicks: value.daily_clicks ?? undefined, daily_clicks_range: value.daily_clicks_range || (value.daily_clicks == null ? undefined : value.daily_clicks < 10 ? 'under10' : value.daily_clicks < 30 ? '10to29' : value.daily_clicks < 50 ? '30to49' : value.daily_clicks < 100 ? '50to99' : 'over100') } as DomainForm; optimizeToday.value = false }
watch(() => props.editData, value => { if (value) setEditData(value) }, { immediate: true })
const handleCancel = () => { dialogVisible.value = false; formRef.value?.resetFields() }
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const handleSubmit = async () => { if (props.saving || !formRef.value) return; form.value.content_stats_updated_date = form.value.platform === 'WordPress' ? (contentDate(form.value.wp_calculator_count, form.value.wp_article_count, props.editData?.wp_calculator_count, props.editData?.wp_article_count, props.editData?.content_stats_updated_date, localDate()) || '') : ''; await formRef.value.validate((valid, fields) => { if (!valid) { console.error('表单验证失败:', fields); return }; const isWordPress = form.value.platform === 'WordPress'; const payload = { ...form.value, seo_today: optimizeToday.value, site_name: form.value.site_name?.trim() || null, industry: form.value.industry?.trim() || null, adsense_account_id: form.value.adsense_account_id || null, adsense_opened_date: form.value.adsense_opened_date || null, seo_last_date: optimizeToday.value ? localDate() : (form.value.seo_last_date || null), daily_clicks: null, daily_clicks_range: form.value.daily_clicks_range || null, clicks_updated_date: clicksDate(form.value.daily_clicks_range, props.editData?.daily_clicks_range || (props.editData?.daily_clicks == null ? null : props.editData.daily_clicks < 10 ? 'under10' : props.editData.daily_clicks < 30 ? '10to29' : props.editData.daily_clicks < 50 ? '30to49' : props.editData.daily_clicks < 100 ? '50to99' : 'over100'), props.editData?.clicks_updated_date, localDate()), platform_other: form.value.platform === '其他' ? (form.value.platform_other || null) : null, wp_calculator_count: isWordPress ? (form.value.wp_calculator_count ?? null) : null, wp_article_count: isWordPress ? (form.value.wp_article_count ?? null) : null, content_stats_updated_date: isWordPress ? contentDate(form.value.wp_calculator_count, form.value.wp_article_count, props.editData?.wp_calculator_count, props.editData?.wp_article_count, props.editData?.content_stats_updated_date, localDate()) : null }; emit('submit', payload) }) }
</script>
<style scoped src="../styles/dialogs/domain.css"></style>
