import { validateCategoryName, validatePromptFields, type Prompt } from '../../shared/prompts'

export class PromptError extends Error {
    constructor(message: string, public status = 400, public data: unknown = null) { super(message) }
}
export const promptId = (value: unknown) => {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) throw new PromptError('编号无效')
    return id
}
const checked = <T>(fn: () => T): T => { try { return fn() } catch (error) { throw new PromptError((error as Error).message) } }
const select = 'SELECT p.*,c.name AS category_name FROM prompts p LEFT JOIN prompt_categories c ON c.id=p.category_id'
export const getPrompt = async (db: D1Database, id: number) => {
    const row = await db.prepare(`${select} WHERE p.id=?`).bind(id).first<Prompt>()
    if (!row) throw new PromptError('提示词不存在', 404)
    return row
}
export const listPrompts = async (db: D1Database, query: URLSearchParams) => {
    const page = promptId(query.get('page') ?? 1), size = promptId(query.get('page_size') ?? 30)
    if (size > 100 || page > 1000000) throw new PromptError('分页参数无效')
    const conditions: string[] = [], values: (string | number)[] = []
    const q = query.get('q') || ''
    if (q.length > 1000) throw new PromptError('搜索内容最多 1000 个字符')
    if (q) { conditions.push("(instr(lower(p.title),lower(?))>0 OR instr(lower(p.content),lower(?))>0 OR instr(lower(COALESCE(c.name,'')),lower(?))>0)"); values.push(q,q,q) }
    const category = query.get('category')
    if (category === 'none') conditions.push('p.category_id IS NULL')
    else if (category) { conditions.push('p.category_id=?'); values.push(promptId(category)) }
    if (query.has('favorite')) { if (query.get('favorite') !== '1') throw new PromptError('收藏筛选无效'); conditions.push('p.is_favorite=1') }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const count = await db.prepare(`SELECT COUNT(*) AS total FROM prompts p LEFT JOIN prompt_categories c ON c.id=p.category_id${where}`).bind(...values).first<{total:number}>()
    const rows = await db.prepare(`SELECT p.id,p.category_id,c.name AS category_name,p.title,substr(p.content,1,160) AS excerpt,p.is_favorite,p.created_at,p.updated_at FROM prompts p LEFT JOIN prompt_categories c ON c.id=p.category_id${where} ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?`).bind(...values,size,(page-1)*size).all()
    return { items: rows.results || [], total: count?.total || 0, page, page_size: size }
}
export const savePrompt = async (db: D1Database, raw: unknown, id?: number) => {
    const fields = checked(() => validatePromptFields(raw))
    if (id) await getPrompt(db,id)
    const values = [fields.title,fields.content] as (string | number)[]
    const statements: D1PreparedStatement[] = []
    if (fields.category_name) statements.push(db.prepare('INSERT INTO prompt_categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING').bind(fields.category_name))
    const categorySql = fields.category_name ? '(SELECT id FROM prompt_categories WHERE name=? COLLATE NOCASE)' : 'NULL'
    if (fields.category_name) values.push(fields.category_name)
    statements.push(id
        ? db.prepare(`UPDATE prompts SET title=?,content=?,category_id=${categorySql},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING id`).bind(...values,id)
        : db.prepare(`INSERT INTO prompts(title,content,category_id) VALUES(?,?,${categorySql}) RETURNING id`).bind(...values))
    try {
        const results = await db.batch<{id:number}>(statements)
        const savedId = results[results.length-1]?.results[0]?.id
        if (!savedId) throw new PromptError('提示词不存在',404)
        return await getPrompt(db,savedId)
    } catch (error) {
        // The unique index also covers simultaneous saves; the batch rolls back a new category.
        const duplicate = await db.prepare(`${select} WHERE p.title=? COLLATE NOCASE AND ${fields.category_name ? 'c.name=? COLLATE NOCASE' : 'p.category_id IS NULL'}`).bind(fields.title,...(fields.category_name ? [fields.category_name] : [])).first<Prompt>()
        if (duplicate && duplicate.id !== id) throw new PromptError('同分类下已有同名提示词，请查看已有条目',409,{existing_id:duplicate.id})
        throw error
    }
}
export const favoritePrompt = async (db: D1Database, id: number, raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof (raw as any).is_favorite !== 'boolean' || Object.keys(raw).some(key=>key!=='is_favorite')) throw new PromptError('收藏状态须为布尔值')
    const row = await db.prepare('UPDATE prompts SET is_favorite=? WHERE id=? RETURNING id').bind((raw as any).is_favorite ? 1 : 0,id).first()
    if (!row) throw new PromptError('提示词不存在',404)
    return getPrompt(db,id)
}
export const deletePrompt = async (db: D1Database, id: number) => {
    const row = await db.prepare('DELETE FROM prompts WHERE id=? RETURNING id').bind(id).first()
    if (!row) throw new PromptError('提示词不存在',404)
    return null
}
export const listCategories = async (db: D1Database) => {
    const items = (await db.prepare('SELECT c.id,c.name,COUNT(p.id) AS count FROM prompt_categories c LEFT JOIN prompts p ON p.category_id=c.id GROUP BY c.id ORDER BY c.name COLLATE NOCASE,c.id').all()).results || []
    const counts = await db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(is_favorite),0) AS favorites,COUNT(CASE WHEN category_id IS NULL THEN 1 END) AS uncategorized FROM prompts').first()
    return {items,...counts}
}
export const saveCategory = async (db: D1Database, raw: unknown, id?: number) => {
    const name = checked(()=>validateCategoryName(raw && typeof raw==='object' ? (raw as any).name : undefined))
    try {
        const row = id ? await db.prepare("UPDATE prompt_categories SET name=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING *").bind(name,id).first()
            : await db.prepare('INSERT INTO prompt_categories(name) VALUES(?) RETURNING *').bind(name).first()
        if (!row) throw new PromptError('分类不存在',404)
        return row
    } catch(error) {
        const existing = await db.prepare('SELECT id FROM prompt_categories WHERE name=? COLLATE NOCASE').bind(name).first<{id:number}>()
        if (existing && existing.id!==id) throw new PromptError('已有同名分类',409)
        throw error
    }
}
export const deleteCategory = async (db: D1Database, id: number) => {
    if (!await db.prepare('SELECT id FROM prompt_categories WHERE id=?').bind(id).first()) throw new PromptError('分类不存在',404)
    const conflicts = (await db.prepare('SELECT p.id,p.title FROM prompts p JOIN prompts u ON u.category_id IS NULL AND u.title=p.title COLLATE NOCASE WHERE p.category_id=?').bind(id).all()).results || []
    if (conflicts.length) throw new PromptError('移到未分类会产生同名冲突，请先修改标题',409,{conflicts})
    try { await db.batch([db.prepare('UPDATE prompts SET category_id=NULL WHERE category_id=?').bind(id),db.prepare('DELETE FROM prompt_categories WHERE id=?').bind(id)]) }
    catch(error) { if (/UNIQUE constraint/i.test(String(error))) throw new PromptError('移到未分类会产生同名冲突，请刷新后修改标题',409); throw error }
    return null
}
