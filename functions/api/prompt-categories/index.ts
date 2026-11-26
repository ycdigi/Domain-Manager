import { promptApi } from '../../utils/prompt-api'
import { listCategories, saveCategory } from '../../domain/prompts'
export const onRequestGet = promptApi(context => listCategories(context.env.DB))
export const onRequestPost = promptApi(async context => saveCategory(context.env.DB,await context.request.json()),201)
