import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { decryptCredential } from '../../../../utils/credentials'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await checkAuth(context)
  if (authError) return authError
  const json = (data: unknown, status = 200, message = '成功') =>
    Response.json({ status, message, data }, { status, headers: { 'Cache-Control': 'no-store' } })
  try {
    const row = await context.env.DB.prepare(
      `SELECT d.domain,r.resource_url,a.login_email,a.status AS account_status,r.status AS resource_status,c.ciphertext,c.status,c.expires_at
            FROM websites w JOIN domains d ON d.website_id=w.id AND d.is_primary=1
            JOIN website_resources wr ON wr.website_id=w.id AND wr.role='代码仓库' AND wr.is_primary=1
            JOIN provider_resources r ON r.id=wr.resource_id AND r.provider='github'
            JOIN provider_accounts a ON a.id=r.account_id
            LEFT JOIN provider_credentials c ON c.account_id=a.id AND c.is_default=1
            WHERE w.id=?`
    )
      .bind(context.params.id)
      .first<{
        domain: string
        resource_url: string
        login_email: string
        ciphertext: string
        status: string
        expires_at: string | null
        account_status: string
        resource_status: string
      }>()
    if (!row) return json(null, 400, '请关联主要 GitHub 仓库及账号')
    if (!row.resource_url || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(row.resource_url))
      return json(null, 400, '请填写有效的 GitHub 仓库地址')
    if (!row.login_email) return json(null, 400, '请补充 GitHub 账号邮箱')
    if (
      !row.ciphertext ||
      row.status !== '有效' ||
      row.account_status === '停用' ||
      row.resource_status === '停用' ||
      (row.expires_at &&
        row.expires_at < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()))
    )
      return json(null, 400, '请设置有效且未到期的默认 Token')
    const token = await decryptCredential(row.ciphertext, context.env.CREDENTIAL_ENCRYPTION_KEY)
    return json({
      text: `域名：${row.domain}\n\nGithub地址：${row.resource_url}\nGithub Email：${row.login_email}\nGithub Token：${token}`
    })
  } catch {
    return json(null, 500, 'GitHub 资料读取或 Token 解密失败')
  }
}
