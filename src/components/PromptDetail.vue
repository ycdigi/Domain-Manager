<template>
  <article class="prompt-detail-content">
    <header class="prompt-detail-header">
      <div class="prompt-detail-identity">
        <div class="prompt-detail-title">
          <h2>{{ prompt.title }}</h2>
          <el-button text :icon="EditPen" @click="emit('edit')">编辑</el-button>
        </div>
        <div class="prompt-detail-meta"><span class="prompt-category-tag">{{ prompt.category_name || '未分类' }}</span><span>更新于 {{ displayTime(prompt.updated_at) }}</span></div>
      </div>
      <div class="prompt-detail-actions">
        <el-button type="primary" @click="emit('copy', false)">复制正文</el-button>
        <el-button @click="emit('copy', true)">复制完整格式</el-button>
        <el-button type="danger" text @click="emit('delete')">删除</el-button>
      </div>
    </header>
    <section class="prompt-body-section" :aria-labelledby="bodyHeadingId">
      <div class="prompt-body-tabs"><h3 :id="bodyHeadingId">提示词正文</h3></div>
      <div class="prompt-body-panel"><pre class="prompt-body" tabindex="0" aria-label="提示词完整正文">{{ prompt.content }}</pre></div>
    </section>
  </article>
</template>
<script setup lang="ts">
import { useId } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import type { Prompt } from '../api/prompts'
defineProps<{prompt:Prompt}>()
const emit=defineEmits<{copy:[full:boolean];edit:[];delete:[]}>()
const bodyHeadingId='prompt-body-'+useId()
const displayTime=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
</script>
