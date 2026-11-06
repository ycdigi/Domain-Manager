import { Env, Domain } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain } from '../../utils/domain-validation'
import { prepareWebsiteChange, websiteWrite, seoTodayWrite, WebsiteChangeError } from '../../domain/website-changes'

export const onRequestPut: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkAuth(context)
        if (authError) return authError

        const id = context.params.id as string
        const data = await context.request.json() as Domain

        const current = await context.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first<Domain>()
        if (!current) return Response.json({ status: 404, message: '域名不存在', data: null }, { status: 404 })
        const change = prepareWebsiteChange(current, data as unknown as Record<string, unknown>, 'replace')
        const duplicate = await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ? AND id != ? LIMIT 1").bind(normalizeDomain(data.domain), id).first()
        if (duplicate) return Response.json({ status: 409, message: '该域名已存在', data: null }, { status: 409 })
        if (data.adsense_account_id != null) {
            const account = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id = ?').bind(data.adsense_account_id).first()
            if (!account) return Response.json({ status: 400, message: 'AdSense 账号不存在', data: null }, { status: 400 })
        }

        const result = change.seoToday
            ? (await context.env.DB.batch([websiteWrite(context.env.DB, change, id), seoTodayWrite(context.env.DB, change.record.domain, change.record.seo_last_date!)]))[0]
            : await websiteWrite(context.env.DB, change, id).run<Domain>()

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
        if (error instanceof WebsiteChangeError) return Response.json({ status: 400, message: error.message, data: null }, { status: 400 })
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
        const input = await context.request.json() as Record<string, unknown>
        const fields = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === '' ? null : value]))
        const allowed = ['ownership', 'site_name', 'industry', 'status', 'platform', 'platform_other', 'adsense_connected', 'adsense_account_id', 'adsense_opened_date', 'wp_calculator_count', 'wp_article_count', 'content_stats_updated_date', 'computer_name']
        const keys = Object.keys(fields)
        if (!keys.length || keys.some(key => !allowed.includes(key))) return Response.json({ status: 400, message: '局部更新包含不支持的字段', data: null }, { status: 400 })

        const current = await context.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first<Domain>()
        if (!current) return Response.json({ status: 404, message: '域名不存在', data: null }, { status: 404 })

        if ('adsense_account_id' in fields && fields.adsense_account_id != null) {
            const account = await context.env.DB.prepare('SELECT id FROM adsense_accounts WHERE id = ?').bind(fields.adsense_account_id).first()
            if (!account) return Response.json({ status: 400, message: 'AdSense 账号不存在', data: null }, { status: 400 })
        }

        const change = prepareWebsiteChange(current, input, 'patch')
        const result = await websiteWrite(context.env.DB, change, id).run<Domain>()
        return Response.json({ status: 200, message: '更新成功', data: result.results?.[0] || null })
    } catch (error) {
        if (error instanceof WebsiteChangeError) return Response.json({ status: 400, message: error.message, data: null }, { status: 400 })
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
