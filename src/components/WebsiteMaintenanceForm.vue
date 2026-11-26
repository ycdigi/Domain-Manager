<template>
  <section class="portfolio-detail-section">
    <h3>维护入口</h3>
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item label="GitHub 推送地址">
        <el-input v-model="form.github_push_url" :placeholder="website.repository?.resource_url || 'https://github.com/用户名/仓库名.git'" maxlength="2048" />
        <small class="page-muted">留空时使用主要代码仓库地址。Token 和邮箱使用总表选中的 GitHub 账号。</small>
      </el-form-item>
      <p v-if="directGithubAccounts.length > 1" class="page-muted">关联了多个 GitHub 账号，请先在总表 GitHub 列选择一个账号。</p>
      <router-link v-else-if="githubAccountId" :to="{name:'Resources',query:{provider:'github',account:String(githubAccountId)}}">设置 GitHub 账号 Token 和邮箱</router-link>
      <p v-else class="page-muted">请先在总表 GitHub 列或下方关联 GitHub 账号。</p>
      <el-form-item v-if="website.platform === 'WordPress'" label="WordPress 后台登录地址">
        <el-input v-model="form.wp_login_url" :placeholder="defaultLogin" maxlength="2048" />
        <small class="page-muted">填写完整自定义地址；留空时使用主域名的 /safelogin。</small>
      </el-form-item>
      <el-button native-type="submit" type="primary" :loading="saving" :disabled="!dirty">保存维护入口</el-button>
    </el-form>
  </section>
</template>
<script setup lang="ts">
import {computed,reactive,ref,watch} from 'vue'
import {ElMessage} from 'element-plus'
import {updateWebsite,type Website} from '../api/websites'
import {websiteEditPatch} from '../../shared/website-edits'
const props=defineProps<{website:Website}>()
const emit=defineEmits<{changed:[]}>()
const form=reactive({github_push_url:'',wp_login_url:''})
const original=ref({...form})
const saving=ref(false)
const dirty=computed(()=>JSON.stringify(form)!==JSON.stringify(original.value))
const directGithubAccounts=computed(()=>props.website.provider_accounts?.filter(a=>a.provider==='github'&&props.website.direct_account_ids?.includes(a.id)) || [])
const githubAccountId=computed(()=>directGithubAccounts.value.length > 1 ? undefined : directGithubAccounts.value[0]?.id || props.website.repository?.account_id)
const defaultLogin=computed(()=>`https://${props.website.domains.find(d=>d.is_primary)?.domain || '网站主域名'}/safelogin`)
watch(()=>props.website,site=>{if(!dirty.value){Object.assign(form,{github_push_url:site.github_push_url || '',wp_login_url:site.wp_login_url || ''});original.value={...form}}},{immediate:true})
const save=async()=>{
  if(saving.value)return
  saving.value=true
  const submitted={...form}
  try {
    await updateWebsite(props.website.id,websiteEditPatch(submitted,original.value))
    original.value=submitted;emit('changed');ElMessage.success('维护入口已保存')
  } catch(error){ElMessage.error(error instanceof Error?error.message:'维护入口保存失败')}
  finally{saving.value=false}
}
defineExpose({dirty,busy:saving})
</script>
