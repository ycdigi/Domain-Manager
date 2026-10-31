import { Env, Domain } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, todayShanghaiDate } from '../../utils/domain-validation'

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkAuth(context)
        if (authError) return authError

        const { domain, status } = await context.request.json() as { domain: string, status: string }
        if (typeof domain !== 'string' || !['在线', '离线'].includes(status)) return Response.json({ status: 400, message: '域名或状态无效', data: null }, { status: 400 })

        const checkedDate = todayShanghaiDate()
        const result = await context.env.DB.prepare(`
            UPDATE domains
            SET status = ?, last_status_check_at = ?
            WHERE lower(rtrim(domain, '.')) = ? AND (status IS NOT ? OR date(last_status_check_at) IS NOT ?)
            RETURNING *
        `).bind(
            status,
            checkedDate,
            normalizeDomain(domain),
            status,
            checkedDate
        ).run<Domain>()

        if (!result.success) {
            throw new Error('更新状态失败')
        }

        return Response.json({
            status: 200,
            message: '更新成功',
            data: result.results?.[0] || null
        })
    } catch (error) {
        console.error('更新域名状态失败:', error)
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '更新域名状态失败',
            data: null
        }, { status: 500 })
    }
}
