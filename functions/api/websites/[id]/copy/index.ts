import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { decryptCredential } from '../../../../utils/credentials'
import { migrateGithubTokens } from '../../../../domain/github-credentials'
import { githubPushUrl } from '../../../../../shared/website-maintenance'

export const onRequestPost: PagesFunction<Env> = async context => {
  const authError = await checkAuth(context); if (authError) return authError
  const json = (data: unknown, status = 200, message = '成功') => Response.json({status,message,data},{status,headers:{'Cache-Control':'no-store'}})
  try {
    const site = await context.env.DB.prepare(`SELECT w.github_push_url,
      (SELECT COUNT(*) FROM website_accounts wa JOIN provider_accounts a ON a.id=wa.account_id WHERE wa.website_id=w.id AND a.provider='github') AS direct_account_count,
      (SELECT r.resource_url FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE wr.website_id=w.id AND wr.role='代码仓库' AND wr.is_primary=1 AND r.provider='github') AS repository_url,
      (SELECT r.status FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE wr.website_id=w.id AND wr.role='代码仓库' AND wr.is_primary=1 AND r.provider='github') AS repository_status,
      COALESCE((SELECT a.id FROM website_accounts wa JOIN provider_accounts a ON a.id=wa.account_id WHERE wa.website_id=w.id AND a.provider='github' ORDER BY wa.id LIMIT 1),
      (SELECT r.account_id FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE wr.website_id=w.id AND wr.role='代码仓库' AND wr.is_primary=1 AND r.provider='github')) AS account_id
      FROM websites w WHERE w.id=?`).bind(context.params.id).first<{direct_account_count:number;github_push_url:string|null;repository_url:string|null;repository_status:string|null;account_id:number|null}>()
    if (!site) return json(null,404,'网站不存在')
    if (site.direct_account_count > 1) return json(null,400,'关联了多个 GitHub 账号，请先在 GitHub 列明确选择一个账号')
    if (!site.account_id) return json(null,400,'请在 GitHub 列选择账号')
    const address = githubPushUrl(site.github_push_url || site.repository_url || '')
    if (!address) return json(null,400,'请在网站详情“部署与账号”中填写 GitHub 推送地址')
    if (!site.github_push_url && site.repository_status === '停用') return json(null,400,'主要 GitHub 仓库已停用，请更新推送地址')
    const account = await context.env.DB.prepare('SELECT login_email,status FROM provider_accounts WHERE id=? AND provider=\'github\'').bind(site.account_id).first<{login_email:string;status:string}>()
    if (!account || account.status === '停用') return json(null,400,'GitHub 账号已停用，请重新选择账号')
    if (!account.login_email?.trim()) return json(null,400,'请补充 GitHub 账号邮箱')
    await migrateGithubTokens(context.env.DB,context.env.CREDENTIAL_ENCRYPTION_KEY,site.account_id)
    const credential = await context.env.DB.prepare('SELECT ciphertext,status,expires_at FROM provider_credentials WHERE account_id=? AND is_default=1').bind(site.account_id).first<{ciphertext:string;status:string;expires_at:string|null}>()
    if (!credential || credential.status !== '有效' || credential.expires_at && credential.expires_at < new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date())) return json(null,400,'请为 GitHub 账号设置有效且未到期的默认 Token')
    const token = await decryptCredential(credential.ciphertext,context.env.CREDENTIAL_ENCRYPTION_KEY)
    return json({text:`地址：${address}\nToken：${token}\nEmail：${account.login_email.trim()}\n最后将整站所有的修正Github推送,包含但不限于当前对话;`})
  } catch { return json(null,500,'GitHub 资料读取或 Token 解密失败，请检查凭据加密配置') }
}
