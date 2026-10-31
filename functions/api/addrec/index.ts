import type { Env } from '../../types'
import { checkApiToken } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'

interface DomainRecord {
    domain: string
    registrar: string
    registrar_link: string
    registrar_date: string
    expiry_date: string
    service_type: string
    status: string
    tgsend: number
    memo?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkApiToken(context)
        if (authError) return authError

        // 解析请求体
        const data = await context.request.json() as DomainRecord
        // 验证必填字段
        const requiredFields = ['domain', 'registrar', 'registrar_date', 'expiry_date', 'service_type', 'status'] as const
        for (const field of requiredFields) {
            if (!data[field]) {
                return Response.json({
                    status: 400,
                    message: `${field} 是必填字段`,
                    data: null
                }, { status: 400 })
            }
        }

        const validationError = validateDomain(data)
        if (validationError) return Response.json({ status: 400, message: validationError, data: null }, { status: 400 })
        data.domain = normalizeDomain(data.domain)

        // 检查域名是否已存在
        const { results: existingDomains } = await context.env.DB.prepare(
            "SELECT id FROM domains WHERE lower(rtrim(domain, '.')) = ? LIMIT 1"
        ).bind(data.domain).all()

        if (existingDomains.length > 0) {
            // 更新现有记录的 service_type 和 status
            const result = await context.env.DB.prepare(`
                UPDATE domains 
                SET service_type = ?, status = ?, memo = ?
                WHERE id = ?
                RETURNING *
            `).bind(
                data.service_type,
                data.status,
                data.memo,
                existingDomains[0].id
            ).run()

            if (result.success) {
                const updatedDomain = result.results?.[0] || null
                return Response.json({
                    status: 200,
                    message: '更新成功',
                    data: updatedDomain
                })
            } else {
                throw new Error('数据库更新失败')
            }
        }

        // 插入新数据
        const result = await context.env.DB.prepare(`
            INSERT INTO domains (
                domain, registrar, registrar_link, registrar_date,
                expiry_date, service_type, status, tgsend, memo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `).bind(
            data.domain,
            data.registrar,
            data.registrar_link || '',
            data.registrar_date,
            data.expiry_date,
            data.service_type,
            data.status,
            data.tgsend || 0,
            data.memo || ''
        ).run()

        if (result.success) {
            const newDomain = result.results?.[0] || null
            return Response.json({
                status: 200,
                message: '创建成功',
                data: newDomain
            })
        } else {
            throw new Error('数据库插入失败')
        }
    } catch (error) {
        console.error('创建域名失败:', error)
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '创建域名失败',
            data: null
        }, { status: 500 })
    }
}
