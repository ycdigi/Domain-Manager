import { api } from '../utils/request'
import type { Prompt, PromptList, PromptFields, PromptCategories } from '../../shared/prompts'
export type { Prompt, PromptSummary, PromptList, PromptFields, PromptCategory, PromptCategories } from '../../shared/prompts'
export const getPrompts = (params: URLSearchParams) => api.get<PromptList>(`/api/prompts?${params}`)
export const getPrompt = (id: number) => api.get<Prompt>(`/api/prompts/${id}`)
export const getPromptCategories = () => api.get<PromptCategories>('/api/prompt-categories')
export const savePrompt = (fields: PromptFields, id?: number) => id ? api.put<Prompt>(`/api/prompts/${id}`,fields) : api.post<Prompt>('/api/prompts',fields)
export const favoritePrompt = (id: number, favorite: boolean) => api.patch<Prompt>(`/api/prompts/${id}`,{is_favorite:favorite})
export const deletePrompt = (id: number) => api.delete(`/api/prompts/${id}`)
export const savePromptCategory = (name: string, id?: number) => id ? api.put(`/api/prompt-categories/${id}`,{name}) : api.post('/api/prompt-categories',{name})
export const deletePromptCategory = (id: number) => api.delete(`/api/prompt-categories/${id}`)
