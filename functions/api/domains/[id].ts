import type { Env } from '../../types'
import { checkAuth } from '../../utils/auth'
import { normalizeDomain, validateDomain } from '../../utils/domain-validation'

const json = (data: unknown, status = 200, message = '成功') => Response.json({ status, message, data }, { status })
const editable = ['website_id', 'domain', 'registrar', 'registrar_link', 'registrar_date', 'expiry_date', 'service_type', 'status', 'memo', 'domain_role', 'is_primary', 'computer_name'] as const

const ensurePrimary = async (db: D1Database, websiteId: number | null) => {
    if (websiteId == null) return
    const current = await db.prepare('SELECT id FROM domains WHERE website_id=? AND is_primary=1 LIMIT 1').bind(websiteId).first<{ id: number }>()
    if (current) return
    const next = await db.prepare('SELECT id FROM domains WHERE website_id=? ORDER BY id LIMIT 1').bind(websiteId).first<{ id: number }>()
    if (next) await db.prepare("UPDATE domains SET is_primary=1, domain_role='主域名' WHERE id=?").bind(next.id).run()
}

export const onRequestPut: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = Number(context.params.id)
        const body = await context.request.json() as Record<string, unknown>
        const current = await context.env.DB.prepare('SELECT * FROM domains WHERE id=?').bind(id).first<Record<string, unknown>>()
        if (!current) return json(null, 404, '域名不存在')
        const updated = { ...current, ...body }
        const validation = validateDomain(updated as never)
        if (validation) return json(null, 400, validation)
        if (body.domain_role !== undefined && !['主域名', '跳转域名', '备用域名'].includes(String(body.domain_role))) return json(null, 400, '域名用途无效')
        const duplicate = await context.env.DB.prepare("SELECT id FROM domains WHERE lower(rtrim(domain, '.'))=? AND id<>?").bind(normalizeDomain(String(updated.domain)), id).first()
        if (duplicate) return json(null, 409, '该域名已存在')
        const db = context.env.DB
        const oldWebsiteId = current.website_id == null ? null : Number(current.website_id)
        const hasWebsite = Object.prototype.hasOwnProperty.call(body, 'website_id')
        const nextWebsiteId = hasWebsite ? (body.website_id == null ? null : Number(body.website_id)) : oldWebsiteId
        if (hasWebsite && nextWebsiteId !== null && (!Number.isInteger(nextWebsiteId) || !await db.prepare('SELECT id FROM websites WHERE id=?').bind(nextWebsiteId).first())) return json(null, 404, '目标网站不存在')
        const moving = hasWebsite && nextWebsiteId !== oldWebsiteId
        if (moving && oldWebsiteId !== null) {
            const count = await db.prepare('SELECT COUNT(*) AS count FROM domains WHERE website_id=?').bind(oldWebsiteId).first<{ count: number }>()
            if (Number(count?.count) <= 1) return json(null, 409, '网站至少需要一个域名；如需停止该网站，请删除整个网站')
        }
        const changes: Record<string, unknown> = Object.fromEntries(editable.filter(key => Object.prototype.hasOwnProperty.call(body, key)).map(key => [key, body[key]]))
        if (hasWebsite) changes.website_id = nextWebsiteId
        if (moving) {
            if (nextWebsiteId === null) changes.is_primary = 0
            else {
                const count = await db.prepare('SELECT COUNT(*) AS count FROM domains WHERE website_id=? AND id<>?').bind(nextWebsiteId, id).first<{ count: number }>()
                if (Number(count?.count) === 0) { changes.is_primary = 1; changes.domain_role = '主域名' }
                else if (body.is_primary === undefined) {
                    changes.is_primary = 0
                    if (body.domain_role === undefined && current.domain_role === '主域名') changes.domain_role = '备用域名'
                }
            }
        }
        if (!Object.keys(changes).length) return json(current)
        const isPrimary = changes.is_primary === true || changes.is_primary === 1
        if (isPrimary && nextWebsiteId !== null) await db.prepare('UPDATE domains SET is_primary=0 WHERE website_id=? AND id<>?').bind(nextWebsiteId, id).run()
        const result = await db.prepare(`UPDATE domains SET ${Object.keys(changes).map(key => `${key}=?`).join(', ')} WHERE id=? RETURNING *`).bind(...Object.entries(changes).map(([key, value]) => key === 'is_primary' ? (isPrimary ? 1 : 0) : value), id).first()
        if (moving) await ensurePrimary(db, oldWebsiteId)
        await ensurePrimary(db, nextWebsiteId)
        return json(result, 200, '域名已更新')
    } catch (error) { if (error instanceof Error && error.message.includes('website_requires_domain')) return json(null, 409, '网站至少需要一个域名'); return json(null, 500, error instanceof Error ? error.message : '域名更新失败') }
}

export const onRequestPatch: PagesFunction<Env> = async context => onRequestPut(context)

export const onRequestDelete: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        const id = Number(context.params.id)
        const domain = await context.env.DB.prepare('SELECT id, website_id FROM domains WHERE id=?').bind(id).first<{ id: number; website_id: number }>()
        if (!domain) return json(null, 404, '域名不存在')
        if (domain.website_id == null) {
            await context.env.DB.prepare('DELETE FROM domains WHERE id=?').bind(id).run()
            return json(null, 200, '未分配域名已删除')
        }
        const count = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM domains WHERE website_id=?').bind(domain.website_id).first<{ count: number }>()
        if (Number(count?.count) <= 1) return json(null, 409, '网站至少需要一个域名；如需停止该网站，请删除整个网站')
        await context.env.DB.prepare('DELETE FROM domains WHERE id=?').bind(id).run()
        await ensurePrimary(context.env.DB, domain.website_id)
        return json(null, 200, '域名已删除')
    } catch (error) { if (error instanceof Error && error.message.includes('website_requires_domain')) return json(null, 409, '网站至少需要一个域名'); return json(null, 500, error instanceof Error ? error.message : '域名删除失败') }
}
