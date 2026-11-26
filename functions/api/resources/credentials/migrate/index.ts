import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { migrateGithubTokens } from '../../../../domain/github-credentials'

export const onRequestPost: PagesFunction<Env> = async context => {
    const authError = await checkAuth(context); if (authError) return authError
    try {
        return Response.json({status:200,data:await migrateGithubTokens(context.env.DB,context.env.CREDENTIAL_ENCRYPTION_KEY)}, {headers:{'Cache-Control':'no-store'}})
    } catch {
        return Response.json({status:400,message:'旧 Token 迁移失败，请检查凭据加密配置后重试'}, {status:400,headers:{'Cache-Control':'no-store'}})
    }
}
