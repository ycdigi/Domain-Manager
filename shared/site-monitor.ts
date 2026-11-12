/// <reference types="@cloudflare/workers-types" />

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
  const requestHeaders = async (method: 'HEAD' | 'GET') => {
    const request = Promise.resolve(fetcher(url.href, {
      method, redirect: 'manual', signal: controller.signal,
      headers: { 'User-Agent': 'Domain-Manager-Monitor/1.0', Accept: '*/*', ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) },
    })).then(value => {
      // Even unsupported HEAD responses and late responses must release their bodies.
      cancelBody(value)
      return value
    })
    return Promise.race([request, deadline])
  }
  const visited = new Set<string>()
  try {
    for (let redirects = 0; ; redirects++) {
      visited.add(url.href)
      result.final_url = url.href
      response = await requestHeaders('HEAD')
      if ([405, 501].includes(response.status)) response = await requestHeaders('GET')
      result.http_status = response.status
      result.available = response.status >= 200 && response.status < 300
      if (![301, 302, 303, 307, 308].includes(response.status)) return finish(result.available ? 'healthy' : 'http_error')
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
