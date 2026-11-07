<template>
    <section class="page-panel">
        <div class="panel-heading"><h2>导入网站组合备份</h2></div>
        <div class="import-container" :aria-busy="loading">
            <el-upload class="upload-area" drag action="#" :auto-upload="false" :show-file-list="true" :limit="1"
                :disabled="loading" accept=".json" :on-change="handleFileChange" :on-exceed="handleExceed" :on-remove="clearFile" :file-list="fileList">
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">
                    拖拽文件到此处或 <em>点击上传</em>
                </div>
                <template #tip>
                    <div class="el-upload__tip">
                        支持网站组合 JSON 备份，也可导入旧版域名对象数组。
                    </div>
                </template>
            </el-upload>

            <div v-if="selectedFile" class="selected-file">
                <span>已选择文件: {{ selectedFile.name }}</span>
                <el-button type="danger" text size="small" @click="clearFile">清除</el-button>
            </div>

            <div v-if="importResult" class="import-result" role="status" aria-live="polite">
                <h3>导入结果:</h3>
                <p role="status">{{ imported ? '导入已完成' : '仅预览，尚未写入数据' }}</p>
                <div class="result-summary">
                    <div class="result-item">新增 {{ importResult.created || 0 }}</div><div class="result-item">更新 {{ importResult.updated || 0 }}</div>
                    <div class="result-item">
                        <p>总数: <span>{{ importResult.total }}</span></p>
                    </div>
                    <div class="result-item success">
                        <p>成功: <span>{{ importResult.success }}</span></p>
                    </div>
                    <div class="result-item error">
                        <p>失败: <span>{{ importResult.failed }}</span></p>
                    </div>
                </div>

                <div v-if="importResult.errors && importResult.errors.length > 0" class="error-details">
                    <h4>错误详情:</h4>
                    <el-collapse>
                        <el-collapse-item :title="`显示 ${importResult.errors.length} 个错误`">
                            <div v-for="(error, index) in importResult.errors" :key="index" class="error-item">
                                <div>
                                    <span class="error-domain">{{ error.domain }}</span>
                                    <span class="error-msg">{{ error.error }}</span>
                                </div>
                            </div>
                        </el-collapse-item>
                    </el-collapse>
                </div>
            </div>
        </div>

        <div class="import-footer">
            <span class="dialog-footer">
                <el-button :disabled="loading" @click="clearFile">清除文件</el-button>
                <el-button type="primary" @click="handleImport" :loading="loading" :disabled="!selectedFile || imported">
                    {{ previewReady ? '确认导入' : '预览文件' }}
                </el-button>
            </span>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { invalidateData } from '../utils/workspaceCache'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'
import { ElMessage } from 'element-plus'
import { confirmAction } from '../utils/feedback'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadUserFile, UploadProps } from 'element-plus'
import { api } from '../utils/request'

// 定义导入结果类型
interface ImportError {
    domain: string;
    error: string;
}

interface ImportResult {
    total: number;
    created?: number;
    updated?: number;
    success: number;
    failed: number;
    errors: ImportError[];
}

const emit = defineEmits(['success'])
const previewReady = ref(false)
const imported = ref(false)
const loading = ref(false)
const fileList = ref<UploadUserFile[]>([])
const selectedFile = ref<File | null>(null)
const importResult = ref<ImportResult | null>(null)

const dirty = computed(() => Boolean(selectedFile.value) && !imported.value)
useUnsavedChanges(dirty)

const handleFileChange: UploadProps['onChange'] = (uploadFile, uploadFiles) => {
    // 验证文件类型
    if (!uploadFile.raw || (uploadFile.raw.type !== 'application/json' && !uploadFile.name.endsWith('.json'))) {
        ElMessage.error('只能上传 JSON 文件!')
        clearFile()
        return
    }
    previewReady.value = false
    imported.value = false
    importResult.value = null
    selectedFile.value = uploadFile.raw
    fileList.value = uploadFiles
}

const handleExceed = () => {
    ElMessage.warning('只能上传 1 个文件!')
}

const clearFile = () => {
    selectedFile.value = null
    fileList.value = []
    previewReady.value = false
    imported.value = false
    importResult.value = null
}

const sendImport = async (dryRun: boolean) => {
    const formData = new FormData()
    formData.append('file', selectedFile.value!)
    const result = await api.upload<ImportResult>(`/api/domains/import${dryRun ? '?dry_run=1' : ''}`, formData)
    importResult.value = result
    return result
}

const handleImport = async () => {
    if (!selectedFile.value) {
        ElMessage.warning('请先选择一个文件')
        return
    }

    if (loading.value) return
    loading.value = true
    try {
        if (!previewReady.value) {
            const preview = await sendImport(true)
            if (!preview) return
            if (preview.failed) { ElMessage.warning('预览发现错误，尚未写入数据'); return }
            previewReady.value = true
            return
        }
        const preview = importResult.value!
        await confirmAction(`本次备份涉及 ${preview.total} 个域名及相关网站记录。确认导入？`, '导入预览', { confirmButtonText: '确认导入' })
        const result = await sendImport(false)
        imported.value = true
        previewReady.value = false
        if (result.success > 0) {
            invalidateData('/api/websites', '/api/domains', '/api/resources', '/api/adsense/accounts', '/api/adsense/income', '/api/dashboard/summary')
            emit('success')
        }
    } catch (error: unknown) {
        if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '导入失败')
    } finally {
        loading.value = false
    }
}

</script>

<style scoped src="../styles/dialogs/import.css"></style>
