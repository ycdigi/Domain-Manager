<template>
  <span class="provider-identity">
    <img v-if="icon" :src="icon" alt="" aria-hidden="true" width="18" height="18" />
    <el-icon v-else aria-hidden="true"><Monitor v-if="provider === 'vps'" /><OfficeBuilding v-else /></el-icon>
    <span>{{ label }}<template v-if="name"> · {{ name }}</template></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Monitor, OfficeBuilding } from '@element-plus/icons-vue'
import github from '../assets/providers/github.svg'
import cloudflare from '../assets/providers/cloudflare.svg'
import hostinger from '../assets/providers/hostinger.svg'
import siteground from '../assets/providers/siteground.ico'
const props = defineProps<{ provider: string; providerName?: string | null; name?: string }>()
const labels: Record<string, string> = { github: 'GitHub', cloudflare: 'Cloudflare', vhost: '虚拟主机', vps: 'VPS' }
const label = computed(() => props.providerName?.trim() || labels[props.provider] || props.provider)
const icon = computed(() => {
  const brand = label.value.toLowerCase()
  if (brand === 'siteground') return siteground
  if (brand === 'hostinger') return hostinger
  if (props.provider === 'github') return github
  if (props.provider === 'cloudflare') return cloudflare
  return undefined
})
</script>

<style scoped src="../styles/dialogs/provider-identity.css"></style>
