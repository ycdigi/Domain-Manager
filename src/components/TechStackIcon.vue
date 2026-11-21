<template>
  <svg v-if="platform === 'WordPress'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.4" />
    <text x="12" y="17.5" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="currentColor">W</text>
  </svg>
  <svg v-else-if="platform === 'Astro'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M8 3h8l5 15-6-2-3-9-3 9-6 2z" />
    <path fill="currentColor" d="M8 18c1 2 2 1 4 1s3 1 4-1c0 3-2 4-4 5-2-1-4-2-4-5" />
  </svg>
  <svg v-else-if="platform === 'Next.js'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M8 17V7l11 14M16 7v8" fill="none" stroke="currentColor" stroke-width="1.8" />
  </svg>
  <el-icon v-else aria-hidden="true"><Cpu /></el-icon>
</template>

<script setup lang="ts">
import { Cpu } from '@element-plus/icons-vue'
defineProps<{ platform: string }>()
</script>
