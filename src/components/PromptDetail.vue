<template>
  <article class="prompt-detail-content">
    <header class="prompt-detail-header">
      <h2>{{ prompt.title }}</h2>
      <div class="prompt-detail-meta"><span class="prompt-category-tag">{{ prompt.category_name || '未分类' }}</span><span>更新于 {{ displayTime(prompt.updated_at) }}</span></div>
      <el-button class="prompt-edit-metadata" text :icon="EditPen" @click="emit('edit', 'metadata')">编辑标题与分类</el-button>
    </header>
    <div class="prompt-detail-actions">
      <el-button type="primary" @click="emit('copy', false)">复制正文</el-button>
      <el-button @click="emit('copy', true)">复制完整格式</el-button>
      <el-button @click="emit('edit', 'content')">编辑正文</el-button>
      <el-button type="danger" text @click="emit('delete')">删除</el-button>
    </div>
    <div class="prompt-body-label">提示词正文</div>
    <pre class="prompt-body" tabindex="0" aria-label="提示词完整正文">{{ prompt.content }}</pre>
  </article>
</template>
<script setup lang="ts">
import { EditPen } from '@element-plus/icons-vue'
import type { Prompt } from '../api/prompts'
defineProps<{prompt:Prompt}>()
const emit=defineEmits<{copy:[full:boolean];edit:[field: 'metadata' | 'content'];delete:[]}>()
const displayTime=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
</script>
