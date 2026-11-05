<template><el-input-number ref="control" v-bind="$attrs" :model-value="modelValue" :disabled="disabled" @update:model-value="value => emit('update:modelValue', value)" @change="(value, old) => emit('change', value, old)" /></template>
<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue?: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | undefined]; change: [value: number | undefined, old: number | undefined] }>()
const control = ref<{ $el: HTMLElement }>()
// Element Plus sets this aria attribute on mount; keep it aligned with the native disabled property.
const syncAccessibility = async () => { await nextTick(); const input = control.value?.$el.querySelector('input'); if (input) input.setAttribute('aria-disabled', String(input.disabled)) }
onMounted(syncAccessibility)
watch(() => props.disabled, syncAccessibility)
</script>
