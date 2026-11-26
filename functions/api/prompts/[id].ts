import { promptApi } from '../../utils/prompt-api'
import { getPrompt, savePrompt, favoritePrompt, deletePrompt, promptId } from '../../domain/prompts'
export const onRequestGet = promptApi(context => getPrompt(context.env.DB,promptId(context.params.id)))
export const onRequestPut = promptApi(async context => savePrompt(context.env.DB,await context.request.json(),promptId(context.params.id)))
export const onRequestPatch = promptApi(async context => favoritePrompt(context.env.DB,promptId(context.params.id),await context.request.json()))
export const onRequestDelete = promptApi(context => deletePrompt(context.env.DB,promptId(context.params.id)))
