import { validateCategoryName, validatePromptFields } from '../../shared/prompts'
type Row = Record<string, any>
const key = (value: string) => value.replace(/[A-Z]/g, c => c.toLowerCase())
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value)>0
const time = (value: unknown) => typeof value==='string' && value.length<=40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
export const validatePromptBackup = (input: Row) => {
    const errors: Array<{domain:string;error:string}> = []
    const categories = new Map<number,string>(), categoryNames = new Set<string>(), prompts = new Set<string>(), ids = new Set<number>()
    for (const table of ['prompt_categories','prompts']) if (input[table]!==undefined && (!Array.isArray(input[table]) || input[table].length>10000)) errors.push({domain:table,error:'记录须为数组且最多 10000 条'})
    if (errors.length) return errors
    for (const row of input.prompt_categories || []) {
        try {
            const name=validateCategoryName(row.name)
            if (!id(row.id) || categories.has(row.id) || name!==row.name || categoryNames.has(key(name)) || !time(row.created_at) || !time(row.updated_at)) throw new Error('分类编号、名称或时间无效或重复')
            categories.set(row.id,name);categoryNames.add(key(name))
        } catch(error) { errors.push({domain:'prompt_categories',error:(error as Error).message}) }
    }
    for (const row of input.prompts || []) {
        try {
            const category = row.category_id==null ? '' : categories.get(row.category_id)
            if (category===undefined) throw new Error('提示词必须关联备份中的分类')
            const fields=validatePromptFields({...row,category_name:category})
            const identity=JSON.stringify([key(category),key(fields.title)])
            if (!id(row.id) || ids.has(row.id) || prompts.has(identity) || fields.title!==row.title || ![0,1].includes(row.is_favorite) || !time(row.created_at) || !time(row.updated_at)) throw new Error('提示词编号、标题、收藏或时间无效或重复')
            ids.add(row.id);prompts.add(identity)
        } catch(error) { errors.push({domain:'prompts',error:(error as Error).message}) }
    }
    return errors
}
export const planPromptRestore = async (db: D1Database, input: Row) => {
    const statements: D1PreparedStatement[] = []
    const names = new Map<number,string>()
    for (const row of input.prompt_categories || []) {
        names.set(row.id,row.name)
        statements.push(db.prepare('INSERT INTO prompt_categories(name,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET created_at=excluded.created_at,updated_at=excluded.updated_at').bind(row.name,row.created_at,row.updated_at))
    }
    let overwritten=0
    for (const row of input.prompts || []) {
        const name = names.get(row.category_id)
        const existing = await db.prepare(`SELECT p.id FROM prompts p LEFT JOIN prompt_categories c ON c.id=p.category_id WHERE p.title=? COLLATE NOCASE AND ${name ? 'c.name=? COLLATE NOCASE' : 'p.category_id IS NULL'}`).bind(row.title,...(name ? [name] : [])).first()
        if (existing) overwritten++
        const categorySql = name ? '(SELECT id FROM prompt_categories WHERE name=? COLLATE NOCASE)' : 'NULL'
        statements.push(db.prepare(`INSERT INTO prompts(category_id,title,content,is_favorite,created_at,updated_at) VALUES(${categorySql},?,?,?,?,?) ON CONFLICT DO UPDATE SET title=excluded.title,content=excluded.content,is_favorite=excluded.is_favorite,created_at=excluded.created_at,updated_at=excluded.updated_at`).bind(...(name ? [name] : []),row.title,row.content,row.is_favorite,row.created_at,row.updated_at))
    }
    return {statements,overwritten}
}
