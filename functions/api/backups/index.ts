import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { restoreBackup, exportBackup } from '../../domain/backup-restore'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })

const parseInput = async (request: Request) => {
    const type = request.headers.get('content-type') || ''
    if (type.includes('application/json')) return { input: await request.json(), batchId: null as number | null }
    if (!type.includes('multipart/form-data')) throw new Error('不支持的内容类型')
    const form = await request.formData()
    const file: unknown = form.get('file')
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024) throw new Error('导入文件不能超过 20 MiB（20 × 1024 × 1024 字节）')
    const rawBatchId = form.get('batch_id')
    const batchId = rawBatchId == null || rawBatchId === '' ? null : Number(rawBatchId)
    if (batchId != null && (!Number.isSafeInteger(batchId) || batchId <= 0)) throw new Error('导入批次编号无效')
    return { input: JSON.parse(await file.text()), batchId }
}

export const onRequestPost: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    try {
        const { input, batchId } = await parseInput(context.request)
        const result = await restoreBackup(context.env.DB, input, { batchId, dryRun: new URL(context.request.url).searchParams.get('dry_run') === '1' })
        return json(result.data, result.status, result.message)
    } catch (error) { return json(null, error instanceof SyntaxError ? 400 : 500, error instanceof SyntaxError ? 'JSON 格式无效，未导入数据' : error instanceof Error ? error.message : '导入失败；请检查文件并重试') }
}

export const onRequestGet: PagesFunction<Env> = async context => {
    const auth = await checkAuth(context); if (auth) return auth
    try { return json(await exportBackup(context.env.DB)) }
    catch (error) { return json(null, 500, error instanceof Error ? error.message : '备份读取失败') }
}
