<template>
  <el-dialog v-model="dialogVisible" :title="domain ? `补充 AdSense 信息 · ${domain}` : '补充 AdSense 信息'" width="420px" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
    <el-form :disabled="saving" ref="formRef" :model="form" :rules="rules" label-width="92px" @submit.prevent="submit" label-position="top">
      <el-form-item label="AdSense账号" prop="adsense_account_id">
        <el-select v-model="form.adsense_account_id" placeholder="选择关联账号" clearable>
          <el-option v-for="account in accounts" :key="account.id" :label="`${account.name} · ${account.owner}`" :value="account.id || 0" />
        </el-select>
      </el-form-item>
      <el-form-item label="开通日期" prop="adsense_opened_date">
        <el-date-picker v-model="form.adsense_opened_date" type="date" value-format="YYYY-MM-DD" placeholder="选择开通日期" clearable />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button :disabled="saving" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

interface AccountOption { id?: number; name: string; owner: string }
interface AdsenseQuickValue { adsense_account_id: number; adsense_opened_date: string }

const props = defineProps<{ saving?: boolean; visible: boolean; domain?: string | null; accounts: AccountOption[]; accountId?: number | null; openedDate?: string | null; registrarDate?: string | null }>()
const emit = defineEmits<{ (event: 'update:visible', value: boolean): void; (event: 'save', value: AdsenseQuickValue): void }>()
const dialogVisible = ref(props.visible)
const formRef = ref<FormInstance>()
const form = ref<AdsenseQuickValue>({ adsense_account_id: props.accountId || 0, adsense_opened_date: props.openedDate || '' })
const rules: FormRules = {
  adsense_account_id: [{ required: true, message: '请选择 AdSense 账号', trigger: 'change' }],
  adsense_opened_date: [{ required: true, message: '请选择开通日期', trigger: 'change' }, { validator: (_rule, value, callback) => props.registrarDate && value && value < props.registrarDate ? callback(new Error('开通日期不能早于注册日期')) : callback(), trigger: 'change' }]
}

watch(() => props.visible, value => {
  dialogVisible.value = value
  if (value) form.value = { adsense_account_id: props.accountId || 0, adsense_opened_date: props.openedDate || '' }
})
watch(dialogVisible, value => emit('update:visible', value))

const submit = async () => {
  if (props.saving || !formRef.value) return
  await formRef.value.validate(valid => { if (valid) emit('save', { ...form.value }) })
}
</script>
