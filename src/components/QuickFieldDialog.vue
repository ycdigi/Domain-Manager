<template>
  <el-dialog v-model="dialogVisible" :title="context ? `${title} · ${context}` : title" width="420px" :close-on-click-modal="false">
    <el-form @submit.prevent="submit">
      <el-form-item :label="label">
        <el-input v-model="draft" :placeholder="placeholder" :maxlength="maxlength" show-word-limit clearable autofocus />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  title: string
  context?: string | null
  label: string
  value?: string | null
  placeholder?: string
  maxlength?: number
}>(), { value: '', context: '', placeholder: '', maxlength: 200 })
const emit = defineEmits<{ (event: 'update:visible', value: boolean): void; (event: 'save', value: string | null): void }>()
const dialogVisible = ref(props.visible)
const draft = ref(props.value || '')

watch(() => props.visible, value => { dialogVisible.value = value; if (value) draft.value = props.value || '' })
watch(dialogVisible, value => emit('update:visible', value))
const submit = () => { emit('save', draft.value.trim() || null) }
</script>
