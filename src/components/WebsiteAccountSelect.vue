<template>
  <el-select class="site-inline-select" :model-value="selected.length > 1 ? -1 : selected[0]?.id ?? 0"
    :aria-label="`${kind === 'github' ? 'GitHub' : '服务商'}：${site.name}`"
    :title="selected.length > 1 ? '已关联多个账号，选择后替换此类别的账号关系' : '选择后自动保存账号关系'"
    :disabled="disabled" filterable @change="value => emit('change', value === 0 ? null : Number(value))">
    <template #label>
      <ProviderIdentity v-if="selected.length === 1" :provider="selected[0]!.provider" :provider-name="selected[0]!.provider_name" :name="selected[0]!.name" compact />
      <span v-else>{{ selected.length > 1 ? `多个账号（${selected.length}）` : '不关联账号' }}</span>
    </template>
    <el-option v-if="selected.length > 1" :value="-1" label="多个账号，选择后替换" disabled />
    <el-option :value="0" label="不关联账号" />
    <el-option v-for="account in options" :key="account.id" :value="account.id!" :label="accountLabel(account)" :disabled="account.status === '停用'">
      <ProviderIdentity :provider="account.provider" :provider-name="account.provider_name" :name="account.name" />
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Website } from '../api/websites'
import type { ProviderAccount } from '../../functions/types'
import ProviderIdentity from './ProviderIdentity.vue'
import { providerIdentity } from '../utils/provider-identity'
const props = defineProps<{ site: Website; kind: 'service' | 'github'; accounts: ProviderAccount[]; disabled: boolean }>()
const emit = defineEmits<{ change: [accountId: number | null] }>()
const matches = (provider: string) => (provider === 'github') === (props.kind === 'github')
const selected = computed(() => (props.site.provider_accounts || []).filter(account => props.site.direct_account_ids?.includes(account.id) && matches(account.provider)))
const options = computed(() => props.accounts.filter(account => matches(account.provider) && (account.status !== '停用' || selected.value.some(current => current.id === account.id))))
const accountLabel = (account: ProviderAccount) => {
  const identity = providerIdentity(account.provider, account.provider_name, account.name)
  return identity.label + (identity.accountName ? ` · ${identity.accountName}` : '')
}
</script>
