import type { ProviderType } from '../types'

export type ResourceBindingInput = { websiteId: number; resourceId?: number; accountId?: number; role: string; isPrimary?: boolean | number; memo?: string | null }
export type ResolvedResource = { id: number; provider: ProviderType; status: string; identifier: string | null; account_id: number | null }
export class ResourceBindingError extends Error {}
export const isAccountOwnershipResource = (identifier: unknown) => typeof identifier === 'string' && /^account:\d+$/.test(identifier)
const isPrimary = (value: unknown) => value === true || value === 1 || value === '1'

export const resolveBindingResource = async (db: D1Database, input: ResourceBindingInput, allowDisabled = false): Promise<ResolvedResource> => {
    if (!Number.isInteger(input.websiteId) || !input.role?.trim() || (!Number.isInteger(input.resourceId) && !Number.isInteger(input.accountId))) throw new ResourceBindingError('网站、账号或资源和角色不能为空')
    if (!await db.prepare('SELECT id FROM websites WHERE id=?').bind(input.websiteId).first()) throw new ResourceBindingError('网站不存在')
    let resourceId = input.resourceId
    if (!resourceId && input.accountId) {
        const account = await db.prepare('SELECT id, provider, name, status FROM provider_accounts WHERE id=?').bind(input.accountId).first<{ id: number; provider: ProviderType; name: string; status: string }>()
        if (!account) throw new ResourceBindingError('服务商账号不存在')
        if (!allowDisabled && account.status === '停用') throw new ResourceBindingError('停用的账号不能新增网站关联')
        const existing = await db.prepare("SELECT id FROM provider_resources WHERE account_id=? AND identifier=?").bind(account.id, `account:${account.id}`).first<{ id: number }>()
        if (existing) resourceId = existing.id
        else {
            const created = await db.prepare(`INSERT INTO provider_resources (account_id, provider, name, identifier, status, memo) VALUES (?, ?, ?, ?, '正常', ?) RETURNING id`).bind(account.id, account.provider, `${account.name}（账号归属）`, `account:${account.id}`, '由账号绑定自动生成，可继续关联具体资源').run<{ id: number }>()
            resourceId = created.results?.[0]?.id
        }
    }
    const resource = await db.prepare(`SELECT r.id, r.provider, r.status, r.identifier, r.account_id, a.status AS account_status FROM provider_resources r LEFT JOIN provider_accounts a ON a.id=r.account_id WHERE r.id=?`).bind(resourceId).first<ResolvedResource & { account_status: string | null }>()
    if (!resource) throw new ResourceBindingError('资源不存在')
    if (!allowDisabled && (resource.status === '停用' || resource.account_status === '停用')) throw new ResourceBindingError('停用的账号或资源不能新增关联')
    return resource
}

export const primaryClearWrite = (db: D1Database, websiteId: number) => db.prepare('UPDATE website_resources SET is_primary=0 WHERE website_id=?').bind(websiteId)
export const bindingWrite = (db: D1Database, input: ResourceBindingInput, resourceId: number) => db.prepare(`
    INSERT INTO website_resources (website_id, resource_id, role, is_primary, memo) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(website_id, resource_id, role) DO UPDATE SET is_primary=excluded.is_primary, memo=excluded.memo RETURNING *
`).bind(input.websiteId, resourceId, input.role.trim(), isPrimary(input.isPrimary) ? 1 : 0, input.memo?.trim() || '')
