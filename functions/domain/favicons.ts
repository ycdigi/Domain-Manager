import { decodeHTML } from 'entities'

const limit = 256 * 1024
const safeUrl = (url: URL) =>
  url.protocol === 'https:' &&
  !url.port &&
  !url.username &&
  !url.password &&
  !/^[\d.]+$/.test(url.hostname) &&
  /^[a-z\d.-]+$/i.test(url.hostname) &&
  url.hostname.includes('.') &&
  !/(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(url.hostname)
const publicAddress = (ip: string) => {
  if (ip.includes(':')) return /^2[0-9a-f]{3}:/i.test(ip) && !/^2001:(?:db8|0|10|20):/i.test(ip)
  const [a, b] = ip.split('.').map(Number)
  return (
    /^\d+\.\d+\.\d+\.\d+$/.test(ip) &&
    a > 0 &&
    a < 224 &&
    ![10, 127].includes(a) &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && [0, 168].includes(b)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && [18, 19, 51].includes(b)) &&
    !(a === 203 && b === 0)
  )
}
const readBounded = async (response: Response, max: number, prefix = false) => {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('empty_body')
  const parts: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (length + chunk.value.length > max) {
        if (!prefix) throw new Error('image_too_large')
        parts.push(chunk.value.subarray(0, max - length))
        length = max
        break
      }
      length += chunk.value.length
      parts.push(chunk.value)
    }
  } finally {
    void reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}
export const fetchFavicon = async (domain: string, fetcher: typeof fetch = fetch) => {
  const signal = AbortSignal.timeout(10000)
  const request = async (initial: URL) => {
    let url = initial
    for (let n = 0; n <= 3; n++) {
      if (!safeUrl(url)) throw new Error('unsafe_url')
      const answers = await Promise.all(
        ['A', 'AAAA'].map(async (type) => {
          const response = await fetcher(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`,
            { signal, headers: { Accept: 'application/dns-json' } }
          )
          if (!response.ok) throw new Error('dns_failed')
          const data = (await response.json()) as { Answer?: Array<{ type: number; data: string }> }
          return (data.Answer || [])
            .filter((record) => record.type === 1 || record.type === 28)
            .map((record) => record.data)
        })
      )
      const addresses = answers.flat()
      if (!addresses.length || addresses.some((ip) => !publicAddress(ip))) throw new Error('private_or_unresolved_host')
      const response = await fetcher(url.href, {
        signal,
        redirect: 'manual',
        headers: { Accept: 'text/html,image/png,image/x-icon,image/webp,image/jpeg,image/gif' }
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        void response.body?.cancel()
        const location = response.headers.get('Location')
        if (!location) throw new Error('invalid_redirect')
        url = new URL(location, url)
        continue
      }
      if (!response.ok) {
        void response.body?.cancel()
        throw new Error('http_error')
      }
      return { response, url }
    }
    throw new Error('too_many_redirects')
  }
  const origin = new URL(`https://${domain}`)
  const candidates: URL[] = []
  try {
    const page = await request(origin)
    const html = new TextDecoder().decode(await readBounded(page.response, limit, true))
    // Only consider explicit raster/ICO candidates; unsafe formats never reach the image endpoint.
    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
      const attrs: Record<string, string> = {}
      for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
        attrs[match[1].toLowerCase()] = decodeHTML(match[2] ?? match[3] ?? match[4])
      if (
        attrs.rel
          ?.toLowerCase()
          .split(/\s+/)
          .some((rel) => ['icon', 'apple-touch-icon'].includes(rel)) &&
        attrs.href
      ) {
        try {
          candidates.push(new URL(attrs.href, page.url))
        } catch {
          /* next declared icon */
        }
      }
    }
  } catch {
    if (signal.aborted) throw new Error('timeout')
  }
  const attempts = [...candidates.slice(0, 4), new URL('/favicon.ico', origin)]
  for (const candidate of attempts) {
    try {
      const { response, url } = await request(candidate)
      const bytes = await readBounded(response, limit)
      const signature = Array.from(bytes.subarray(0, 12))
      let mime = ''
      if (signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') mime = 'image/png'
      else if (signature.slice(0, 4).join(',') === '0,0,1,0') mime = 'image/x-icon'
      else if (signature[0] === 255 && signature[1] === 216 && signature[2] === 255) mime = 'image/jpeg'
      else if (new TextDecoder().decode(bytes.subarray(0, 6)).match(/^GIF8[79]a$/)) mime = 'image/gif'
      else if (
        new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
        new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
      )
        mime = 'image/webp'
      if (!mime) throw new Error('unsupported_image')
      let binary = ''
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte)
      })
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      return {
        source_url: url.href,
        image_data: btoa(binary),
        mime_type: mime,
        content_hash: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
      }
    } catch {
      if (signal.aborted) throw new Error('timeout')
    }
  }
  throw new Error('favicon_unavailable')
}

export const cacheDomainFavicon = async (
  db: D1Database,
  domainId: number,
  force = false,
  fetcher: typeof fetch = fetch
) => {
  const domain = await db
    .prepare('SELECT id,domain FROM domains WHERE id=?')
    .bind(domainId)
    .first<{ id: number; domain: string }>()
  if (!domain) return
  const now = new Date().toISOString()
  const next = new Date(Date.now() + 86400000).toISOString()
  await db
    .prepare(`INSERT OR IGNORE INTO domain_favicons(domain_id,source_domain) VALUES(?,?)`)
    .bind(domainId, domain.domain)
    .run()
  // Conditional claim prevents duplicate external fetches across requests/worker invocations.
  const claim = await db
    .prepare(
      `UPDATE domain_favicons SET image_data=CASE WHEN source_domain=? THEN image_data ELSE NULL END,source_domain=?,status='pending',last_attempt_at=?,retry_after=? WHERE domain_id=? AND (?=1 OR source_domain<>? OR (image_data IS NULL AND (retry_after IS NULL OR retry_after<=?))) RETURNING domain_id`
    )
    .bind(domain.domain, domain.domain, now, next, domainId, force ? 1 : 0, domain.domain, now)
    .first()
  if (!claim) return
  try {
    const image = await fetchFavicon(domain.domain, fetcher)
    await db
      .prepare(
        `UPDATE domain_favicons SET source_url=?,image_data=?,mime_type=?,content_hash=?,status='success',fetched_at=?,last_error=NULL WHERE domain_id=? AND last_attempt_at=? AND EXISTS(SELECT 1 FROM domains WHERE id=? AND domain=?)`
      )
      .bind(
        image.source_url,
        image.image_data,
        image.mime_type,
        image.content_hash,
        new Date().toISOString(),
        domainId,
        now,
        domainId,
        domain.domain
      )
      .run()
  } catch {
    await db
      .prepare(
        `UPDATE domain_favicons SET status=CASE WHEN image_data IS NULL THEN 'failure' ELSE 'success' END,last_error='图标获取失败' WHERE domain_id=? AND last_attempt_at=?`
      )
      .bind(domainId, now)
      .run()
  }
}
export const runFaviconTick = async (db: D1Database) => {
  const row = await db
    .prepare(
      `SELECT d.id FROM domains d LEFT JOIN domain_favicons f ON f.domain_id=d.id WHERE d.is_primary=1 AND d.website_id IS NOT NULL AND (f.domain_id IS NULL OR f.source_domain<>d.domain OR f.image_data IS NULL AND (f.retry_after IS NULL OR f.retry_after<=?)) ORDER BY d.id LIMIT 1`
    )
    .bind(new Date().toISOString())
    .first<{ id: number }>()
  if (row) await cacheDomainFavicon(db, row.id)
}
