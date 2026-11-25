import { websiteFields, normalizeWebsiteEdit } from '../../shared/website-edits'
import { validateWebsiteFields } from './website-validation'

type Fields = Record<string, unknown>
export type WebsiteEditSource = 'human' | 'ai' | 'batch'
const humanFields = new Set<string>(websiteFields)
const humanOnly = new Set(['stage', 'lifecycle', 'priority_order', 'next_action', 'next_action_due_date', 'next_action_status', 'new_site_override'])
const batchFields = new Set(['stage', 'lifecycle'])
export class WebsiteEditError extends Error {
    constructor(message: string, readonly status = 400) { super(message) }
}

// Validation, normalization and reference checks happen before a statement can
// be included in a larger atomic operation (AI sync also writes tasks).
export const prepareWebsiteEdit = async (db: D1Database, input: unknown, source: WebsiteEditSource, current: Fields = {}) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WebsiteEditError('网站字段必须是对象')
    const raw = input as Fields
    if (Object.keys(raw).some(key => !humanFields.has(key) || source === 'ai' && humanOnly.has(key) || source === 'batch' && !batchFields.has(key))) throw new WebsiteEditError('网站更新包含不支持的字段')
    const fields = normalizeWebsiteEdit(raw)
    const validation = validateWebsiteFields(fields, current)
    if (validation) throw new WebsiteEditError(validation)
    const accountId = Object.prototype.hasOwnProperty.call(fields, 'adsense_account_id') ? fields.adsense_account_id : current.adsense_account_id
    if (accountId != null && !await db.prepare('SELECT id FROM adsense_accounts WHERE id=?').bind(accountId).first()) throw new WebsiteEditError('AdSense 账号不存在')
    return fields
}

export const websiteEditWrite = (db: D1Database, id: number, fields: Fields) => {
    const entries = Object.entries(fields)
    return db.prepare(`UPDATE websites SET ${entries.map(([key]) => `${key}=?`).join(', ')} WHERE id=? RETURNING *`).bind(...entries.map(([, value]) => value), id)
}

export const updateWebsite = async (db: D1Database, id: number, input: unknown) => {
    const current = await db.prepare('SELECT * FROM websites WHERE id=?').bind(id).first<Fields>()
    if (!current) throw new WebsiteEditError('网站不存在', 404)
    const fields = await prepareWebsiteEdit(db, input, 'human', current)
    if (!Object.keys(fields).length) throw new WebsiteEditError('网站更新不能为空')
    return websiteEditWrite(db, id, fields).first()
}
