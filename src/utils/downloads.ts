import { ElMessage } from 'element-plus'
import { api } from './request'
import { localDate } from './workspaceCache'
const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const downloadJsonBackup = async () => {
    const file = await api.download('/api/domains/export')
    saveBlob(file.blob, file.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'domains-export.json')
}
export const downloadIncome = async () => {
    const file = await api.download('/api/adsense/income/export')
    saveBlob(file.blob, 'adsense-income.json')
}
export const downloadExcel = async () => {
    const loading = ElMessage.info({ message: '正在准备导出数据…', duration: 0 })
    try {
        const snapshot = await api.get<Record<string, unknown[]>>('/api/export/snapshot')
        const XLSX = await import('xlsx')
        const workbook = XLSX.utils.book_new()
        const sensitiveKey = /pass(word)?|token|ciphertext|secret|credential/i
        const sheets = [['域名总表', 'domains'], ['操作记录', 'operations'], ['AdSense账号', 'adsense_accounts'], ['AdSense月收入', 'adsense_income'], ['AdSense网站美元明细', 'adsense_income_domains'], ['基础设施账号', 'provider_accounts'], ['基础设施资源', 'provider_resources'], ['网站资源关联', 'domain_resources'], ['AI提示词与想法', 'ai_notes']]
        for (const [name, key] of sheets) {
            const rows = (snapshot[key] || []).map(row => Object.fromEntries(Object.entries((row || {}) as Record<string, unknown>).filter(([field]) => !sensitiveKey.test(field))))
            const sheet = XLSX.utils.json_to_sheet(rows)
            sheet['!cols'] = (rows.length ? Object.keys(rows[0]) : []).map(column => ({ wch: Math.min(42, Math.max(12, ...rows.map(row => String(row[column] ?? '').length + 2))) }))
            XLSX.utils.book_append_sheet(workbook, sheet, name)
        }
        XLSX.writeFile(workbook, `domain-manager-${localDate()}.xlsx`)
    } finally { loading.close() }
}
