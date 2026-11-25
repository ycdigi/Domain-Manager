<script lang="ts">
export type ChoiceValue = string | number | null
export interface WebsiteChoiceOption {
  value: ChoiceValue
  label: string
  search?: string
  provider?: string
  providerName?: string | null
  name?: string
  computer?: string
  platform?: string
  disabled?: boolean
}
</script>

<template>
  <el-popover :visible="true" :virtual-ref="anchor" virtual-triggering placement="bottom-start"
    :width="width" :persistent="false" :show-arrow="false" popper-class="site-choice-popper"
    :popper-options="{ modifiers: [{ name: 'preventOverflow', options: { padding: 12, altAxis: true } }] }">
    <section id="website-choice-panel" ref="panel" v-click-outside="outside" role="dialog" :aria-label="`选择${label}`"
      class="site-choice-editor" :aria-busy="busy" @keydown.esc.stop.prevent="!busy && emit('cancel', true)" @keydown="navigate">
      <header><strong>{{ label }} · {{ websiteName }}</strong><button type="button" class="site-choice-close" aria-label="关闭选择" :disabled="busy" @click="emit('cancel', true)"><el-icon aria-hidden="true"><Close /></el-icon></button></header>
      <el-input v-if="searchable" ref="searchInput" v-model="query" :aria-label="`搜索${label}`" placeholder="搜索选项" clearable :disabled="busy" />
      <ul role="listbox" :aria-label="label" class="site-choice-options">
        <li role="presentation" v-for="(option, index) in filtered" :key="`${typeof option.value}:${option.value}`">
          <button type="button" role="option" :aria-selected="option.value === current" :disabled="busy || option.disabled"
            :tabindex="index === active ? 0 : -1" :data-option-index="index" :class="{ 'is-selected': option.value === current }" @focus="active = index" @click="emit('choose', option.value)">
            <ProviderIdentity v-if="option.provider" :provider="option.provider" :provider-name="option.providerName" :name="option.name" compact />
            <ComputerIdentity v-else-if="option.computer" :name="option.computer" />
            <span v-else-if="option.platform" class="site-choice-identity"><TechStackIcon :platform="option.platform" /><span>{{ option.label }}</span></span>
            <span v-else>{{ option.label }}</span>
            <el-icon v-if="option.value === current" class="site-choice-check" aria-hidden="true"><Check /></el-icon>
          </button>
        </li>
        <li v-if="canCreate" role="presentation"><button type="button" role="option" :aria-selected="false" :disabled="busy" :tabindex="active === filtered.length ? 0 : -1" :data-option-index="filtered.length" @focus="active = filtered.length" @click="emit('choose', query.trim())">使用“{{ query.trim() }}”</button></li>
      </ul>
      <p v-if="!filtered.length && !canCreate" class="site-choice-empty">没有匹配的选项</p>
      <p v-if="busy" role="status" class="site-choice-empty">正在保存…</p>
      <p v-if="error" role="alert" class="site-choice-error">{{ error }}；请重新选择以重试。</p>
    </section>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Check, Close } from '@element-plus/icons-vue'
import { ClickOutside as vClickOutside, type InputInstance } from 'element-plus'
import ProviderIdentity from './ProviderIdentity.vue'
import ComputerIdentity from './ComputerIdentity.vue'
import TechStackIcon from './TechStackIcon.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
const props = defineProps<{ label: string; websiteName: string; anchor: HTMLElement; options: WebsiteChoiceOption[]; current: ChoiceValue; searchable: boolean; allowCreate: boolean; busy: boolean; error: string }>()
const emit = defineEmits<{ choose: [value: ChoiceValue]; cancel: [restoreFocus: boolean] }>()
const query = ref(''), active = ref(-1), panel = ref<HTMLElement>(), searchInput = ref<InputInstance>()
const width = ref(Math.min(280, window.innerWidth - 24))
const filtered = computed(() => props.options.filter(option => `${option.label} ${option.search || ''}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))
const canCreate = computed(() => props.allowCreate && !!query.value.trim() && !props.options.some(option => String(option.value ?? '').toLocaleLowerCase() === query.value.trim().toLocaleLowerCase()))
const outside = (event: MouseEvent) => { if (!props.busy && !props.anchor.contains(event.target as Node)) emit('cancel', false) }
const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape' && !props.busy) { event.preventDefault(); emit('cancel', true) } }
const resize = () => { width.value = Math.min(280, window.innerWidth - 24) }
const navigate = (event: KeyboardEvent) => {
  if (props.busy || event.isComposing || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  if (event.target === searchInput.value?.input && ['Home', 'End'].includes(event.key)) return
  const buttons = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || [])
  if (!buttons.length) return
  const current = buttons.findIndex(button => Number(button.dataset.optionIndex) === active.value)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (current < 0 ? 0 : (current + 1) % buttons.length) : (current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length)
  event.preventDefault()
  buttons[index]?.focus()
  buttons[index]?.scrollIntoView({ block: 'nearest' })
}
useUnsavedChanges(computed(() => false), { blocked: computed(() => props.busy), unload: false })
onMounted(async () => {
  window.addEventListener('resize', resize)
  document.addEventListener('keydown', dismiss)
  await nextTick()
  active.value = Math.max(0, props.options.findIndex(option => option.value === props.current))
  if (props.searchable) searchInput.value?.focus()
  else (panel.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') || panel.value?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)'))?.focus()
})
watch(query, () => { active.value = Math.max(0, filtered.value.findIndex(option => option.value === props.current)) })
watch(() => props.busy, async (busy, previous) => {
  if (previous && !busy && props.error) { await nextTick(); panel.value?.querySelector<HTMLButtonElement>(`[data-option-index="${active.value}"]`)?.focus() }
})
onUnmounted(() => { window.removeEventListener('resize', resize); document.removeEventListener('keydown', dismiss) })
</script>

<style src="../styles/dialogs/website-choice.css"></style>
