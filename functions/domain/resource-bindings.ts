import { idGroups } from './bulk-ids'
import { resourceSupportsRole } from '../../shared/resource-roles'
import type { ProviderType } from '../types'

export type ResourceBindingInput = { websiteId: number; resourceId: number; role: string; isPrimary?: boolean | number; memo?: string | null }
type ResolvedResource = { id: number; provider: ProviderType; status: string; identifier: string | null; account_id: number | null }
export class ResourceBindingError extends Error {}
const isPrimary = (value: unknown) => value === true || value === 1

const resolveBindingResource = async (db: D1Database, input: ResourceBindingInput): Promise<ResolvedResource> => {
    if (input.isPrimary !== undefined && ![true,false,0,1].includes(input.isPrimary)) throw new ResourceBindingError('主要资源标记无效')
    if (!Number.isInteger(input.websiteId) || !input.role?.trim() || !Number.isInteger(input.resourceId)) throw new ResourceBindingError('网站、实际资源和用途不能为空')
    if (!await db.prepare('SELECT id FROM websites WHERE id=?').bind(input.websiteId).first()) throw new ResourceBindingError('网站不存在')
    const resourceId = input.resourceId
    const resource = await db.prepare(`SELECT r.id, r.provider, r.status, r.identifier, r.account_id, a.status AS account_status FROM provider_resources r LEFT JOIN provider_accounts a ON a.id=r.account_id WHERE r.id=?`).bind(resourceId).first<ResolvedResource & { account_status: string | null }>()
    if (!resource) throw new ResourceBindingError('资源不存在')
    if ((resource.status === '停用' || resource.account_status === '停用')) throw new ResourceBindingError('停用的账号或资源不能新增关联')
    if (!resourceSupportsRole(resource.provider, input.role)) throw new ResourceBindingError('资源类型与用途不匹配')
    if (input.role === '托管' && resource.provider === 'github') throw new ResourceBindingError('GitHub 仓库不能作为托管资源')
    if (input.role === '代码仓库' && resource.provider !== 'github') throw new ResourceBindingError('代码仓库必须关联 GitHub 资源')
    return resource
}

// Complete write group used by both live changes and historical restoration.
// Restore has already validated its snapshot resources, which may not exist yet.
export const resourceBindingWrites = (db: D1Database, input: ResourceBindingInput, history?: { createdAt?: unknown }) => {
    const role = input.role.trim(), primary = isPrimary(input.isPrimary) ? 1 : 0
    const statements: D1PreparedStatement[] = []
    if (primary) statements.push(db.prepare('UPDATE website_resources SET is_primary=0 WHERE website_id=? AND role=?').bind(input.websiteId, role))
    statements.push(db.prepare(`INSERT INTO website_resources (website_id, resource_id, role, is_primary, memo, created_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?,CURRENT_TIMESTAMP))
        ON CONFLICT(website_id, resource_id, role) DO UPDATE SET is_primary=excluded.is_primary,
        memo=CASE WHEN ?=1 THEN excluded.memo ELSE website_resources.memo END,
        created_at=CASE WHEN ?=1 THEN excluded.created_at ELSE website_resources.created_at END RETURNING *`)
        .bind(input.websiteId,input.resourceId,role,primary,history ? input.memo || null : input.memo?.trim() || '',history?.createdAt || null,history || input.memo !== undefined ? 1 : 0,history ? 1 : 0))
    return statements
}

export const bindWebsiteResource = async (db: D1Database, input: ResourceBindingInput) => {
    await resolveBindingResource(db, input)
    const results = await db.batch(resourceBindingWrites(db,input))
    return results[results.length-1]?.results?.[0] || null
}

// Bulk callers receive one complete write group and include it with their other
// changes in the same transaction.
export const prepareWebsiteResourceAssignments = async (db: D1Database, websiteIds: number[], assignments: Array<{role: string; resource_id: number | null}>) => {
    const writes: D1PreparedStatement[] = []
    for (const assignment of assignments) {
        if (assignment.resource_id !== null) await resolveBindingResource(db, { websiteId: websiteIds[0]!, resourceId: assignment.resource_id, role: assignment.role, isPrimary: true })
        for (const ids of idGroups(websiteIds)) {
            const placeholders = ids.map(() => '?').join(',')
            if (assignment.resource_id === null) writes.push(db.prepare(`DELETE FROM website_resources WHERE website_id IN (${placeholders}) AND role=?`).bind(...ids, assignment.role))
            else {
                writes.push(db.prepare(`UPDATE website_resources SET is_primary=0 WHERE website_id IN (${placeholders}) AND role=?`).bind(...ids, assignment.role))
                writes.push(db.prepare(`INSERT INTO website_resources(website_id,resource_id,role,is_primary,memo) SELECT id,?,?,1,'' FROM websites WHERE id IN (${placeholders})
                    ON CONFLICT(website_id,resource_id,role) DO UPDATE SET is_primary=1`).bind(assignment.resource_id, assignment.role, ...ids))
            }
        }
    }
    return writes
}
