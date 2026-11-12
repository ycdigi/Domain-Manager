/// <reference types="@cloudflare/workers-types" />
import { decodeHTML } from 'entities'

// Legacy content fields remain readable in stored checks and backups.
export type MonitorCheckResult = {
  outcome: 'healthy' | 'failure' | 'review' | 'incomplete'
  reason: string
  http_status: number | null
  response_ms: number
  final_url: string
  title: string | null
  content_complete: boolean
  available: boolean | null
}

const equivalentHost = (host: string) => host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
const safeUrl = (url: URL) => {
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  // URL normalizes unusual IPv4 spellings (integer, octal, hex) before this check.
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && !host.includes(':') && !/^[\d.]+$/.test(host) && host.includes('.')
    && host.split('.').every(label => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label))
    && !/(^|\.)(localhost|local|localdomain|internal|lan|home|corp|test|invalid|example|onion)$/.test(host)
    && !host.endsWith('.home.arpa')
}

const cancelBody = (response: Response) => {
  if (response.body) void response.body.cancel().catch(() => {})
}

// Read only the HTML prefix needed for <title>; never scan the page body.
const readTitle = async (response: Response, deadline: Promise<never>): Promise<string | null> => {
  const type = response.headers.get('Content-Type') || ''
  if (type && !/^(text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(type)) {
    cancelBody(response)
    return null
  }
  const reader = response.body?.getReader()
  if (!reader) return null
  let decoder: TextDecoder
  try { decoder = new TextDecoder(/charset\s*=\s*["']?([^\s;"']+)/i.exec(type)?.[1] || 'utf-8') }
  catch { decoder = new TextDecoder() }
  let prefix = ''; let bytes = 0
  try {
    while (bytes < 64 * 1024) {
      const chunk = await Promise.race([reader.read(), deadline])
      if (chunk.done) return null
      const remaining = 64 * 1024 - bytes
      prefix += decoder.decode(chunk.value.subarray(0, remaining), { stream: true })
      bytes += chunk.value.byteLength
      // Consume complete tags, including quoted attributes, before looking inside text.
      const tokens = /<!--[\s\S]*?(?:-->|$)|<\/?([a-z][a-z\d:-]*)\b(?:[^"'<>]|"[^"]*(?:"|$)|'[^']*(?:'|$))*(?:>|$)/gi
      let match: RegExpExecArray | null
      while ((match = tokens.exec(prefix))) {
        const tag = match[1]?.toLowerCase()
        if (!tag) continue
        if (!match[0].endsWith('>')) break
        if (!match[0].startsWith('</') && ['script', 'style', 'noscript', 'template'].includes(tag)) {
          const close = new RegExp(`</${tag}\\s*>`, 'gi')
          close.lastIndex = tokens.lastIndex
          if (!close.exec(prefix)) break
          tokens.lastIndex = close.lastIndex
          continue
        }
        if (/^<title\b/i.test(match[0])) {
          const close = /<\/title\s*>/gi
          close.lastIndex = tokens.lastIndex
          const end = close.exec(prefix)
          if (end) return decodeHTML(prefix.slice(tokens.lastIndex, end.index)).replace(/\s+/g, ' ').trim().slice(0, 1000) || null
          break
        }
        if (/^<\/head|^<body/i.test(match[0])) return null
      }
    }
  } catch {
    // A missing title never overwrites the HTTP response already received.
  } finally {
    void reader.cancel().catch(() => {})
  }
  return null
}

export async function checkWebsite(input: {
  domain: string
  allowed_redirect_hosts: string[]
  required_text?: string[]
  forbidden_text?: string[]
  baseline_title?: string | null
}, fetcher: typeof fetch = fetch): Promise<MonitorCheckResult> {
  const started = performance.now()
  const result: MonitorCheckResult = {
    outcome: 'failure', reason: 'invalid_url', http_status: null, response_ms: 0,
    final_url: '', title: null, content_complete: false, available: null,
  }
  const finish = (reason: string): MonitorCheckResult => ({
    ...result, reason, outcome: reason === 'healthy' ? 'healthy' : 'failure',
    response_ms: Math.max(0, performance.now() - started),
  })
  let url: URL
  try {
    const domain = input.domain.trim()
    url = new URL(domain.includes('://') ? domain : `https://${domain}`)
    url.hash = ''
    result.final_url = url.href
    if (!safeUrl(url)) return finish('unsafe_host_or_url')
  } catch { return finish('invalid_url') }

  const initialHost = equivalentHost(url.hostname)
  const controller = new AbortController()
  let timedOut = false
  let response: Response | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
  })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Monitoring deadline exceeded', 'TimeoutError'))
  }, 10_000)
  const requestPage = async () => {
    const request = Promise.resolve(fetcher(url.href, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { 'User-Agent': 'Domain-Manager-Monitor/1.0', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    })).then(value => {
      if (controller.signal.aborted) cancelBody(value)
      return value
    })
    return Promise.race([request, deadline])
  }
  const visited = new Set<string>()
  try {
    for (let redirects = 0; ; redirects++) {
      visited.add(url.href)
      result.final_url = url.href
      response = await requestPage()
      result.http_status = response.status
      result.available = response.status >= 200 && response.status < 300
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        result.title = await readTitle(response, deadline)
        return finish(result.available ? 'healthy' : 'http_error')
      }
      cancelBody(response)
      const location = response.headers.get('Location')
      if (!location) return finish('redirect_location_missing')
      let target: URL
      try { target = new URL(location, url) } catch { return finish('redirect_location_invalid') }
      target.hash = ''
      if (target.protocol === 'http:') return finish('https_downgrade')
      if (!safeUrl(target)) return finish('unsafe_redirect_host_or_url')
      if (equivalentHost(target.hostname) !== initialHost
        && !input.allowed_redirect_hosts.some(host => equivalentHost(host.trim()) === equivalentHost(target.hostname))) return finish('cross_domain_redirect')
      if (visited.has(target.href)) return finish('redirect_loop')
      if (redirects === 3) return finish('redirect_limit')
      url = target
    }
  } catch (error) {
    return finish(timedOut ? 'timeout' : error instanceof Error && error.name === 'AbortError' ? 'request_aborted' : 'network_error')
  } finally {
    clearTimeout(timer)
  }
}
