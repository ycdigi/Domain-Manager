export interface Prompt {
    id: number
    category_id: number | null
    category_name: string | null
    title: string
    content: string
    is_favorite: number
    created_at: string
    updated_at: string
}
export interface PromptFields { category_name: string; title: string; content: string }
export interface PromptCategory { id: number; name: string; count: number }
export interface PromptCategories { items: PromptCategory[]; total: number; favorites: number; uncategorized: number }
export type PromptSummary = Omit<Prompt, 'content'> & { excerpt: string }
export interface PromptList { items: PromptSummary[]; total: number; page: number; page_size: number }

export const validateCategoryName = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 50 || /[.\r\n]/.test(value)) throw new Error('分类名称须为 1–50 个字符，不能包含英文点号或换行')
    return value.trim()
}
export const validatePromptFields = (raw: unknown): PromptFields => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('提示词格式无效')
    const value = raw as Record<string, unknown>
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200 || /[\r\n]/.test(value.title)) throw new Error('标题须为 1–200 个字符且不能换行')
    if (typeof value.content !== 'string' || !value.content.trim() || value.content.length > 100000) throw new Error('正文不能为空，最多 100,000 个字符')
    const category = value.category_name === undefined || value.category_name === '' ? '' : validateCategoryName(value.category_name)
    return { category_name: category, title: value.title.trim(), content: value.content }
}
export const parsePromptPaste = (raw: string): PromptFields => {
    const lines = [...raw.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)]
    if (lines.filter(line => /^\s*【提示词标题】/.test(line[1] || '')).length > 1) throw new Error('当前仅支持单条收集，请拆分后粘贴')
    const first = lines.find(line => line[1]?.trim())
    if (!first) throw new Error('请先粘贴提示词')
    const heading = first[1]!.trim().replace(/^【提示词标题】\s*/, '').replace(/\\$/, '').trim()
    const dot = heading.indexOf('.')
    if (dot === 0 || dot === heading.length - 1) throw new Error('请补全点号两侧的分类和标题')
    return validatePromptFields({ category_name: dot < 0 ? '' : heading.slice(0, dot).trim(), title: dot < 0 ? heading : heading.slice(dot + 1), content: raw.slice(first.index! + first[0].length) })
}
export const formatPrompt = (value: Pick<Prompt, 'category_name' | 'title' | 'content'>) => `【提示词标题】${value.category_name ? value.category_name + '.' : ''}${value.title}\n${value.content}`
