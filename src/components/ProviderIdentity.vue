<template>
  <span class="provider-identity">
    <img v-if="icon" :src="icon" alt="" aria-hidden="true" width="18" height="18" />
    <el-icon v-else aria-hidden="true"><Monitor v-if="provider === 'vps'" /><OfficeBuilding v-else /></el-icon>
    <span>{{ identity.label }}<template v-if="identity.accountName"> · {{ identity.accountName }}</template></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Monitor, OfficeBuilding } from '@element-plus/icons-vue'
import github from '../assets/providers/github.svg'
import cloudflare from '../assets/providers/cloudflare.svg'
import hostinger from '../assets/providers/hostinger.svg'
import siteground from '../assets/providers/siteground.ico'
import { providerIdentity } from '../utils/provider-identity'
const props = defineProps<{ provider: string; providerName?: string | null; name?: string }>()
const identity = computed(() => providerIdentity(props.provider, props.providerName, props.name))
const icons: Record<string, string> = { github, cloudflare, siteground, hostinger }
const icon = computed(() => icons[identity.value.icon || ''])
</script>

<style scoped src="../styles/dialogs/provider-identity.css"></style>
