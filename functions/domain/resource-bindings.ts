import { resourceSupportsRole } from '../../shared/resource-roles'
import type { ProviderType } from '../types'

export type ResourceBindingInput = { websiteId: number; resourceId: number; role: string; isPrimary?: boolean | number; memo?: string | null }
export type ResolvedResource = { id: number; provider: ProviderType; status: string; identifier: string | null; account_id: number | null }
export class ResourceBindingError extends Error {}
const isPrimary = (value: unknown) => value === true || value === 1 || value === '1'

export const resolveBindingResource = async (db: D1Database, input: ResourceBindingInput, allowDisabled = false): Promise<ResolvedResource> => {
    if (!Number.isInteger(input.websiteId) || !input.role?.trim() || !Number.isInteger(input.resourceId)) throw new ResourceBindingError('网站、实际资源和用途不能为空')
    if (!await db.prepare('SELECT id FROM websites WHERE id=?').bind(input.websiteId).first()) throw new ResourceBindingError('网站不存在')
    const resourceId = input.resourceId
    const resource = await db.prepare(`SELECT r.id, r.provider, r.status, r.identifier, r.account_id, a.status AS account_status FROM provider_resources r LEFT JOIN provider_accounts a ON a.id=r.account_id WHERE r.id=?`).bind(resourceId).first<ResolvedResource & { account_status: string | null }>()
    if (!resource) throw new ResourceBindingError('资源不存在')
    if (!allowDisabled && (resource.status === '停用' || resource.account_status === '停用')) throw new ResourceBindingError('停用的账号或资源不能新增关联')
    if (!resourceSupportsRole(resource.provider, input.role)) throw new ResourceBindingError('资源类型与用途不匹配')
    if (!allowDisabled && input.role === '托管' && resource.provider === 'github') throw new ResourceBindingError('GitHub 仓库不能作为托管资源')
    if (!allowDisabled && input.role === '代码仓库' && resource.provider !== 'github') throw new ResourceBindingError('代码仓库必须关联 GitHub 资源')
    return resource
}

export const primaryClearWrite = (db: D1Database, websiteId: number, role: string) => db.prepare('UPDATE website_resources SET is_primary=0 WHERE website_id=? AND role=?').bind(websiteId, role)
export const bindingWrite = (db: D1Database, input: ResourceBindingInput, resourceId: number) => db.prepare(`
    INSERT INTO website_resources (website_id, resource_id, role, is_primary, memo) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(website_id, resource_id, role) DO UPDATE SET is_primary=excluded.is_primary, memo=CASE WHEN ?=1 THEN excluded.memo ELSE website_resources.memo END RETURNING *
`).bind(input.websiteId, resourceId, input.role.trim(), isPrimary(input.isPrimary) ? 1 : 0, input.memo?.trim() || '', input.memo === undefined ? 0 : 1)
