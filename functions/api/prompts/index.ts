import { promptApi } from '../../utils/prompt-api'
import { listPrompts, savePrompt } from '../../domain/prompts'
export const onRequestGet = promptApi(context => listPrompts(context.env.DB,new URL(context.request.url).searchParams))
export const onRequestPost = promptApi(async context => savePrompt(context.env.DB,await context.request.json()),201)
