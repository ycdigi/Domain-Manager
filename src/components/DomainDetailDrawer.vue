<template>
  <el-drawer v-model="drawerVisible" :title="domain?.domain ? `${domain.domain} · 运营详情` : '运营详情'" size="520px" destroy-on-close>
    <template v-if="domain">
      <section class="detail-section">
        <div class="detail-grid">
          <div><span>状态</span><strong>{{ domain.status }}</strong></div>
          <div><span>资源</span><strong>{{ domain.resource_status || '未关联' }}</strong></div>
          <div><span>注册日期</span><strong>{{ domain.registrar_date || '未记录' }}</strong></div>
          <div><span>到期日期</span><strong>{{ domain.expiry_date || '未记录' }}</strong></div>
          <div><span>最近 SEO</span><strong>{{ domain.seo_last_date || '未记录' }}</strong></div>
          <div><span>点击数据</span><strong>{{ domain.daily_clicks ?? '未填写' }}<small v-if="domain.clicks_updated_date"> · {{ domain.clicks_updated_date }}</small></strong></div>
          <div><span>状态检查</span><strong>{{ datePart(domain.last_status_check_at) }}</strong></div>
          <div><span>AdSense</span><strong>{{ domain.adsense_connected || '未知' }}<small v-if="domain.adsense_opened_date"> · {{ domain.adsense_opened_date }}</small></strong></div>
        </div>
        <div class="detail-line"><span>部署资源</span><p>{{ domain.resource_names || '未关联' }}</p></div>
        <div class="detail-line"><span>备注</span><p>{{ domain.memo || '未记录' }}</p></div>
      </section>

      <section class="detail-section">
        <div class="section-heading"><h3>AI 提示与想法</h3><el-button type="primary" size="small" @click="startCreate">新增记录</el-button></div>
        <div v-if="notes.length" class="note-list">
          <article v-for="note in notes" :key="note.id" class="note-card">
            <div class="note-meta"><span class="note-kind">{{ note.kind }}</span><span>更新于 {{ datePart(note.updated_at) }}</span></div>
            <p class="note-content">{{ note.content }}</p>
            <div class="note-actions">
              <el-button text size="small" @click="copyNote(note.content)">复制</el-button>
              <el-button text size="small" @click="startEdit(note)">编辑</el-button>
              <el-button text size="small" @click="showHistory(note)">历史</el-button>
              <el-button text size="small" type="danger" @click="archiveNote(note)">归档</el-button>
            </div>
          </article>
        </div>
        <p v-else class="detail-empty">还没有 AI 提示或想法。</p>
      </section>

      <el-form v-if="editing" :model="noteForm" label-position="top" class="note-form">
        <el-form-item label="类型"><el-select v-model="noteForm.kind"><el-option label="AI提示词" value="AI提示词" /><el-option label="想法说明" value="想法说明" /></el-select></el-form-item>
        <el-form-item label="内容"><el-input v-model="noteForm.content" type="textarea" :rows="8" maxlength="20000" show-word-limit placeholder="输入要发送给 AI 的提示词，或记录你的判断和想法" /></el-form-item>
        <div class="note-form-actions"><el-button @click="editing = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveNote">保存</el-button></div>
      </el-form>

      <el-dialog v-model="historyVisible" title="修改历史" width="460px" append-to-body>
        <div v-if="history.length" class="history-list">
          <article v-for="version in history" :key="version.id" class="history-item"><div><strong>版本 {{ version.version_no }}</strong><span>{{ datePart(version.created_at) }}</span></div><p>{{ version.content }}</p></article>
        </div>
        <p v-else class="detail-empty">暂无历史版本。</p>
      </el-dialog>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useAuth } from '../utils/auth'
import type { DomainData } from '../api/domains'

type NoteKind = 'AI提示词' | '想法说明'
interface Note { id: number; domain_id: number; kind: NoteKind; content: string; updated_at?: string; version_count?: number }
interface Version { id: number; note_id: number; kind: NoteKind; content: string; version_no: number; created_at?: string }
const props = defineProps<{ visible: boolean; domain?: DomainData }>()
const emit = defineEmits<{ (event: 'update:visible', value: boolean): void; (event: 'changed'): void }>()
const router = useRouter()
const drawerVisible = computed({ get: () => props.visible, set: value => emit('update:visible', value) })
const notes = ref<Note[]>([])
const editing = ref(false)
const saving = ref(false)
const noteForm = ref<{ id?: number; kind: NoteKind; content: string }>({ kind: 'AI提示词', content: '' })
const historyVisible = ref(false)
const history = ref<Version[]>([])
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${useAuth().getAuthToken()?.token || ''}` })
const datePart = (value?: string | null) => value ? value.slice(0, 16).replace('T', ' ') : '未记录'
const api = async (url: string, options: RequestInit = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } })
  const result = await response.json() as { status: number; message: string; data: any }
  if (response.status === 401) { useAuth().clearAuth(); await router.push({ name: 'Login' }); throw new Error('登录状态无效，请重新登录') }
  if (!response.ok || result.status >= 400) throw new Error(result.message || '请求失败')
  return result.data
}
const loadNotes = async () => { if (!props.domain?.id) return; notes.value = await api(`/api/domains/${props.domain.id}/ai-notes`) }
const startCreate = () => { noteForm.value = { kind: 'AI提示词', content: '' }; editing.value = true }
const startEdit = (note: Note) => { noteForm.value = { id: note.id, kind: note.kind, content: note.content }; editing.value = true }
const saveNote = async () => {
  if (!props.domain?.id || !noteForm.value.content.trim()) { ElMessage.warning('请输入内容'); return }
  saving.value = true
  try {
    const id = noteForm.value.id
    await api(id ? `/api/domains/${props.domain.id}/ai-notes/${id}` : `/api/domains/${props.domain.id}/ai-notes`, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ kind: noteForm.value.kind, content: noteForm.value.content }) })
    editing.value = false; await loadNotes(); emit('changed'); ElMessage.success('记录已保存')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') } finally { saving.value = false }
}
const archiveNote = async (note: Note) => {
  if (!props.domain?.id || !note.id) return
  try { await ElMessageBox.confirm('归档后首页不再计入当前提示数量，但修改历史仍会保留。', '归档记录', { type: 'warning' }); await api(`/api/domains/${props.domain.id}/ai-notes/${note.id}`, { method: 'POST' }); await loadNotes(); emit('changed') } catch (error) { if (error !== 'cancel') ElMessage.error(error instanceof Error ? error.message : '归档失败') }
}
const showHistory = async (note: Note) => { if (!props.domain?.id || !note.id) return; try { history.value = await api(`/api/domains/${props.domain.id}/ai-notes/${note.id}/history`); historyVisible.value = true } catch (error) { ElMessage.error(error instanceof Error ? error.message : '历史读取失败') } }
const copyNote = async (content: string) => { try { await navigator.clipboard.writeText(content); ElMessage.success('已复制') } catch { ElMessage.error('复制失败，请手动选择文本') } }
watch(() => [props.visible, props.domain?.id], ([visible]) => { if (visible) { editing.value = false; void loadNotes() } })
</script>

<style scoped src="../styles/dialogs/domain-detail.css"></style>
