<template>
  <div class="workspace-page">
    <WorkspaceHeading title="收入与投入" subtitle="按网站查看收入与每周投入"
      ><el-button @click="load">刷新</el-button
      ><router-link :to="{ name: 'Adsense' }">AdSense 账号收入</router-link></WorkspaceHeading
    >
    <div v-if="error" class="page-error" role="alert">{{ error }}</div>
    <el-tabs v-model="tab"
      ><el-tab-pane label="网站收入" name="income" /><el-tab-pane label="每周投入" name="effort"
    /></el-tabs>
    <section class="page-panel">
      <div class="page-actions">
        <el-select v-model="websiteId" filterable clearable placeholder="全部网站" aria-label="筛选网站"
          ><el-option v-for="site in sites" :key="site.id" :value="site.id" :label="site.name" /></el-select
        ><el-button :disabled="!websiteId" @click="open(websiteId!)">记录收入或投入</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" empty-text="暂无记录"
        ><el-table-column label="网站"
          ><template #default="{ row }"
            ><button class="page-link" @click="open(row.website_id)">{{ siteName(row.website_id) }}</button></template
          ></el-table-column
        ><template v-if="tab === 'income'"
          ><el-table-column prop="income_month" label="月份" /><el-table-column
            label="来源"><template #default="{ row }">{{ row.source }}{{ row.origin === 'adsense_account' ? ' · 账号收入' : '' }}</template></el-table-column><el-table-column prop="currency" label="币种" /><el-table-column
            prop="amount"
            label="金额" /></template
        ><template v-else
          ><el-table-column prop="week_start" label="周起始日" /><el-table-column
            prop="hours"
            label="投入小时" /><el-table-column prop="memo" label="备注" /></template
        ><el-table-column label="操作"
          ><template #default="{ row }"
            ><el-button text @click="open(row.website_id)">详情 / 记录</el-button></template
          ></el-table-column
        ></el-table
      >
    </section>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { websiteQuery } from '../utils/website-location'
import { useRouter } from 'vue-router'
import WorkspaceHeading from '../components/WorkspaceHeading.vue'
import { api } from '../utils/request'
const router = useRouter()
const tab = ref('income')
const loading = ref(false)
const error = ref('')
const websiteId = ref<number>()
const sites = ref<Array<{ id: number; name: string }>>([])
type Row = { website_id: number; [key: string]: unknown }
const incomes = ref<Row[]>([])
const efforts = ref<Row[]>([])
const rows = computed(() =>
  (tab.value === 'income' ? incomes.value : efforts.value).filter(
    (r) => !websiteId.value || r.website_id === websiteId.value
  )
)
const siteName = (id: number) => sites.value.find((s) => s.id === id)?.name || `网站 #${id}`
const open = (id: number) => router.push({ name: 'Home', query: websiteQuery(id, 'finance') })
const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get<{ websites: typeof sites.value; website_income: Row[]; website_effort: Row[] }>(
      '/api/finance'
    )
    sites.value = data.websites
    incomes.value = data.website_income
    efforts.value = data.website_effort
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取失败'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>
