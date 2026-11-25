import { ElMessage } from 'element-plus'
import { api } from './request'
import { managementExportRows } from '../../shared/website-management'
import { localDate } from './workspaceCache'
const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const downloadJsonBackup = async () => {
    const snapshot = await api.get('/api/backups')
    saveBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type:'application/json' }), `website-backup-${localDate()}.json`)
}
export const downloadIncome = async () => {
    const file = await api.download('/api/adsense/income/export')
    saveBlob(file.blob, 'adsense-income.json')
}
export const downloadExcel = async () => {
    const loading = ElMessage.info({ message: '正在准备导出数据…', duration: 0 })
    try {
        const snapshot = await api.get<Record<string, unknown[]>>('/api/backups')
        const XLSX = await import('xlsx')
        const workbook = XLSX.utils.book_new()
        const sensitiveKey = /pass(word)?|token|ciphertext|secret|credential/i
        const sheets = [['网站组合', 'websites'], ['域名资产', 'domains'], ['网站收入', 'website_income'], ['每周投入', 'website_effort'], ['网站任务', 'website_tasks'], ['SEO点击快照', 'website_click_snapshots'], ['操作记录', 'website_operations'], ['工作登记历史', 'website_work_records'], ['GSC账号', 'gsc_accounts'], ['GSC网站归属', 'website_gsc_accounts'], ['AdSense账号', 'adsense_accounts'], ['AdSense账号月收入', 'adsense_income'], ['基础设施账号', 'provider_accounts'], ['基础设施资源', 'provider_resources'], ['网站资源关联', 'website_resources'], ['网站账号关系', 'website_accounts'], ['网站提示词与想法', 'website_ai_notes'], ['提示词历史', 'website_ai_note_versions']]
        for (const [name, key] of sheets) {
            const rows = (snapshot[key] || []).map(row => Object.fromEntries(Object.entries((row || {}) as Record<string, unknown>).filter(([field]) => !sensitiveKey.test(field))))
            const sheet = XLSX.utils.json_to_sheet(rows)
            sheet['!cols'] = (rows.length ? Object.keys(rows[0]) : []).map(column => ({ wch: Math.min(42, Math.max(12, ...rows.map(row => String(row[column] ?? '').length + 2))) }))
            XLSX.utils.book_append_sheet(workbook, sheet, name)
        }
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(managementExportRows(snapshot)), '网站管理')
        XLSX.writeFile(workbook, `domain-manager-${localDate()}.xlsx`)
    } finally { loading.close() }
}
