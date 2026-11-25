<template>
  <el-popover :visible="true" :virtual-ref="anchor" virtual-triggering placement="bottom" :width="280" :persistent="false">
    <section role="dialog" :aria-label="`编辑${label}`" class="site-metric-editor">
      <strong>{{ website.name }} · {{ label }}</strong>
      <form @submit.prevent="save" @keydown.esc.stop.prevent="!busy && emit('cancel')">
        <label :for="`metric-value-${website.id}`">{{ label }}</label>
        <el-input ref="valueInput" :id="`metric-value-${website.id}`" v-model="value" type="number" min="0" step="1" :disabled="busy || Boolean(range)" />
        <template v-if="field === 'daily_clicks'">
          <label :for="`metric-range-${website.id}`">点击区间</label>
          <el-select :teleported="false" :id="`metric-range-${website.id}`" v-model="range" clearable :disabled="busy" @change="value = ''">
            <el-option label="10 次以下" value="under10" /><el-option label="10–29 次" value="10to29" /><el-option label="30–49 次" value="30to49" /><el-option label="50–99 次" value="50to99" /><el-option label="100 次以上" value="over100" />
          </el-select>
        </template>
        <label :for="`metric-date-${website.id}`">统计日期</label>
        <el-input :id="`metric-date-${website.id}`" v-model="date" type="date" :required="value !== '' || Boolean(range)" :disabled="busy" />
        <div class="page-actions">
          <el-button :disabled="busy" @click="emit('cancel')">取消</el-button>
          <el-button type="primary" native-type="submit" :loading="busy">保存</el-button>
        </div>
      </form>
    </section>
  </el-popover>
</template>
<script setup lang="ts">
import { websiteMetricEdit } from '../../shared/website-edits'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
import type { InputInstance } from 'element-plus'
import type { Website } from '../api/websites'
const props = defineProps<{ website: Website; field: 'page_count' | 'calculator_count' | 'article_count' | 'daily_clicks'; label: string; anchor: HTMLElement; busy: boolean }>()
const emit = defineEmits<{ save: [fields: Record<string, unknown>]; cancel: [] }>()
const valueInput = ref<InputInstance>()
const value = ref(props.website[props.field] == null ? '' : String(props.website[props.field]))
const range = ref(props.field === 'daily_clicks' ? props.website.daily_clicks_range || '' : '')
const date = ref((props.field === 'daily_clicks' ? props.website.clicks_updated_date : props.website.content_stats_updated_date) || '')
const baseline = JSON.stringify([value.value, range.value, date.value])
useUnsavedChanges(computed(() => JSON.stringify([value.value, range.value, date.value]) !== baseline), { blocked: computed(() => props.busy) })
onMounted(async () => { await nextTick(); valueInput.value?.focus() })
const save = () => {
  if (props.busy) return
  const count = value.value === '' ? null : Number(value.value)
  if (count !== null && (!Number.isInteger(count) || count < 0)) return
  emit('save', websiteMetricEdit(props.field, count, date.value || null, range.value || null))

}
</script>
