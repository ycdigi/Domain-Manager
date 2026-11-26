import { promptApi } from '../../utils/prompt-api'
import { saveCategory, deleteCategory, promptId } from '../../domain/prompts'
export const onRequestPut = promptApi(async context => saveCategory(context.env.DB,await context.request.json(),promptId(context.params.id)))
export const onRequestDelete = promptApi(context => deleteCategory(context.env.DB,promptId(context.params.id)))
