import type { Env } from '../../../../types'
import { checkAuth } from '../../../../utils/auth'
import { cacheDomainFavicon } from '../../../../domain/favicons'
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await checkAuth(context)
  if (auth) return auth
  const row = await context.env.DB.prepare(
    `SELECT f.* FROM domain_favicons f JOIN domains d ON d.id=f.domain_id AND d.domain=f.source_domain WHERE d.id=?`
  )
    .bind(context.params.id)
    .first<{ image_data: string; mime_type: string; content_hash: string }>()
  if (!row?.image_data) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return new Response(
    Uint8Array.from(atob(row.image_data), (c) => c.charCodeAt(0)),
    {
      headers: {
        'Content-Type': row.mime_type,
        'Cache-Control': 'private, max-age=86400',
        ETag: `"${row.content_hash}"`,
        'X-Content-Type-Options': 'nosniff'
      }
    }
  )
}
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await checkAuth(context)
  if (auth) return auth
  const id = Number(context.params.id)
  if (!(await context.env.DB.prepare('SELECT id FROM domains WHERE id=?').bind(id).first()))
    return Response.json({ status: 404, message: '域名不存在', data: null }, { status: 404 })
  await cacheDomainFavicon(context.env.DB, id, true)
  const row = await context.env.DB.prepare('SELECT status,last_error FROM domain_favicons WHERE domain_id=?')
    .bind(id)
    .first()
  return Response.json({ status: 200, message: '图标刷新已完成', data: row })
}
