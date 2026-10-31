import { Env, Domain } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain, todayShanghaiDate } from '../../utils/domain-validation'

export const onRequestPut: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkAuth(context)
        if (authError) return authError

        const id = context.params.id as string
        const data = await context.request.json() as Domain

        const validationError = validateDomain(data)
        if (validationError) return Response.json({ status: 400, message: validationError, data: null }, { status: 400 })
        const duplicate = await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ? AND id != ? LIMIT 1").bind(normalizeDomain(data.domain), id).first()
        if (duplicate) return Response.json({ status: 409, message: '该域名已存在', data: null }, { status: 409 })
        if (data.adsense_account_id != null) {
            const account = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id = ?').bind(data.adsense_account_id).first()
            if (!account) return Response.json({ status: 400, message: 'AdSense 账号不存在', data: null }, { status: 400 })
        }

        const result = await context.env.DB.prepare(`
            UPDATE domains SET
                domain = ?,
                registrar = ?,
                registrar_link = ?,
                registrar_date = ?,
                expiry_date = ?,
                service_type = ?,
                status = ?,
                tgsend = ?,
                st_tgsend = ?,
                memo = ?,
                site_name = ?,
                industry = ?,
                adsense_account_id = ?,
                adsense_connected = ?,
                adsense_opened_date = ?,
                seo_last_date = ?,
                daily_clicks = ?,
                clicks_updated_date = CASE WHEN daily_clicks IS NOT ? THEN ? ELSE clicks_updated_date END,
                platform = ?,
                platform_other = ?,
                wp_calculator_count = ?,
                wp_article_count = ?,
                content_stats_updated_date = ?
            WHERE id = ?
            RETURNING *
        `).bind(
            normalizeDomain(data.domain),
            data.registrar,
            data.registrar_link || '',
            data.registrar_date,
            data.expiry_date,
            data.service_type,
            data.status,
            data.tgsend || 0,
            data.st_tgsend ?? 1,
            data.memo || '',
            data.site_name?.trim() || null,
            data.industry?.trim() || null,
            data.adsense_account_id || null,
            data.adsense_connected || '未知',
            data.adsense_opened_date || null,
            data.seo_last_date || null,
            data.daily_clicks ?? null,
            data.daily_clicks ?? null,
            data.daily_clicks == null ? null : (data.clicks_updated_date || todayShanghaiDate()),
            data.platform || '其他',
            data.platform === '其他' ? (data.platform_other || null) : null,
            data.platform === 'WordPress' ? (data.wp_calculator_count ?? null) : null,
            data.platform === 'WordPress' ? (data.wp_article_count ?? null) : null,
            data.platform === 'WordPress' ? (data.content_stats_updated_date || null) : null,
            id
        ).run<Domain>()

        if (result.success) {
            const updatedDomain = result.results?.[0] || null
            if (!updatedDomain) {
                return Response.json({
                    status: 404,
                    message: '域名不存在',
                    data: null
                }, { status: 404 })
            }

            return Response.json({
                status: 200,
                message: '更新成功',
                data: updatedDomain
            })
        } else {
            throw new Error('数据库更新失败')
        }
    } catch (error) {
        console.error('更新域名失败:', error)
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '更新域名失败',
            data: null
        }, { status: 500 })
    }
}

export const onRequestPatch: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context)
    if (authError) return authError
    try {
        const id = context.params.id as string
        const fields = await context.request.json() as Record<string, unknown>
        const allowed = ['site_name', 'industry', 'status', 'platform', 'platform_other']
        const keys = Object.keys(fields)
        if (!keys.length || keys.some(key => !allowed.includes(key))) return Response.json({ status: 400, message: '局部更新包含不支持的字段', data: null }, { status: 400 })

        const current = await context.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first<Domain>()
        if (!current) return Response.json({ status: 404, message: '域名不存在', data: null }, { status: 404 })

        const merged = { ...current, ...fields }
        if (fields.platform && fields.platform !== '其他') merged.platform_other = null
        const validationError = validateDomain(merged)
        if (validationError) return Response.json({ status: 400, message: validationError, data: null }, { status: 400 })

        const assignments: string[] = []
        const values: unknown[] = []
        for (const key of keys) {
            assignments.push(`${key} = ?`)
            values.push(fields[key] === '' ? null : fields[key])
        }
        if (fields.platform && fields.platform !== '其他' && !keys.includes('platform_other')) {
            assignments.push('platform_other = ?')
            values.push(null)
        }
        const result = await context.env.DB.prepare(`UPDATE domains SET ${assignments.join(', ')} WHERE id = ? RETURNING *`).bind(...values, id).run<Domain>()
        return Response.json({ status: 200, message: '更新成功', data: result.results?.[0] || null })
    } catch (error) {
        console.error('局部更新域名失败:', error)
        return Response.json({ status: 500, message: error instanceof Error ? error.message : '局部更新域名失败', data: null }, { status: 500 })
    }
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkAuth(context)
        if (authError) return authError

        const id = context.params.id

        const result = await context.env.DB.prepare(
            'DELETE FROM domains WHERE id = ?'
        ).bind(id).run()

        if (result.success) {
            return Response.json({
                status: 200,
                message: '删除成功',
                data: null
            })
        } else {
            throw new Error('删除失败')
        }
    } catch (error) {
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '删除域名失败',
            data: null
        }, { status: 500 })
    }
}
