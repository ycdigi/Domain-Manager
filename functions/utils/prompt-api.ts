import type { Env } from '../types'
import { checkAuth } from './auth'
import { PromptError } from '../domain/prompts'
export const promptApi = (handler: (context: EventContext<Env, string, unknown>) => Promise<unknown>, success = 200): PagesFunction<Env> => async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try { return Response.json({status:success,message:'成功',data:await handler(context)},{status:success}) }
    catch(error) {
        const status = error instanceof PromptError ? error.status : error instanceof SyntaxError ? 400 : 500
        return Response.json({status,message:status===500 ? '提示词操作失败，请重试' : (error as Error).message,data:error instanceof PromptError ? error.data : null},{status})
    }
}
