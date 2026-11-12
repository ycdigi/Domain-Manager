/// <reference types="@cloudflare/workers-types" />
import { decodeHTML } from 'entities'

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

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim()
const equivalentHost = (host: string) => host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
const bodyByteLimit = 64 * 1024
const extractedTextLimit = 8 * 1024
const nativeEventLimit = 256
// Availability is known, but CPU admission/extraction limits prevent a complete
// content verdict. Never treat missing keywords in this sample as a failure.
const contentLimitReason = 'content_extraction_limit'

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

// Extract text without executing markup. Raw-text elements must be skipped as a
// whole so JavaScript strings containing closing HTML tags cannot escape them.
const htmlContent = (html: string) => {
  const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][a-z\d:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi
  const excluded: string[] = []
  const text: string[] = []
  let title: string | null = null
  let offset = 0
  let events = 0
  let match: RegExpExecArray | null
  while ((match = tags.exec(html))) {
    if (++events > nativeEventLimit) throw new Error(contentLimitReason)
    if (!excluded.length) text.push(decodeHTML(html.slice(offset, match.index)))
    offset = tags.lastIndex
    const tag = match[1]?.toLowerCase()
    if (!tag) continue
    const closing = match[0].startsWith('</')
    // HTML permits </head> to be omitted before body content.
    if (!closing && !['html', 'head', 'base', 'link', 'meta', 'title', 'style', 'script', 'noscript', 'template'].includes(tag)) {
      const head = excluded.indexOf('head')
      if (head !== -1 && excluded.length === head + 1) excluded.splice(head, 1)
    }
    const hidden = !closing && Array.from(match[0].slice(tag.length + 1, -1)
      .matchAll(/(?:^|\s)([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g))
      .some(attribute => attribute[1].toLowerCase() === 'hidden')
    if (!closing && ['script', 'style', 'noscript', 'title'].includes(tag)) {
      const end = new RegExp(`</${tag}\\s*>`, 'gi')
      end.lastIndex = offset
      const close = end.exec(html)
      if (tag === 'title' && title === null && excluded.every(parent => parent === 'head')) {
        title = normalizeText(decodeHTML(html.slice(offset, close?.index ?? html.length))).slice(0, 1000) || null
      }
      tags.lastIndex = offset = close ? end.lastIndex : html.length
      continue
    }
    if (closing) {
      const index = excluded.lastIndexOf(tag)
      if (index !== -1) excluded.splice(index)
    } else if ((excluded.length || hidden || ['head', 'template'].includes(tag))
      && !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)) {
      excluded.push(tag)
    }
    if (!excluded.length && !hidden && /^(address|article|aside|blockquote|br|dd|div|dl|dt|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|td|th|tr|ul)$/.test(tag)) text.push(' ')
  }
  if (!excluded.length) text.push(decodeHTML(html.slice(offset)))
  return { text: normalizeText(text.join('')), title }
}

// Workers use lol-html rather than the portable tokenizer above. Bound JS
// callbacks and decoded text as well as input bytes for Free-first, single-site
// invocations. An over-budget sample is incomplete, never a content failure.
const nativeHtmlContent = async (html: string, signal: AbortSignal) => {
  const excluded: { tag: string }[] = []
  const parts: string[] = []
  let events = 0
  let extracted = 0
  let node = ''
  let title = ''
  let inTitle = false
  let seenTitle = false
  const budget = (length = 0) => {
    extracted += length
    if (++events > nativeEventLimit || extracted > extractedTextLimit) throw new Error(contentLimitReason)
  }
  const rewriter = new HTMLRewriter()
    .on('head,script,style,template,noscript,[hidden]', {
      element(element) {
        budget()
        const entry = { tag: element.tagName }
        // Void elements have no content and never produce an end-tag callback.
        if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(entry.tag)) {
          excluded.push(entry)
          element.onEndTag(() => {
            budget()
            const index = excluded.indexOf(entry)
            if (index !== -1) excluded.splice(index, 1)
          })
        }
        element.remove()
      },
    })
    .on('body', { element() {
      budget()
      const head = excluded.findIndex(entry => entry.tag === 'head')
      if (head !== -1) excluded.splice(head, 1)
    } })
    .on('title', { element(element) {
      budget()
      if (!seenTitle && excluded.every(entry => entry.tag === 'head')) {
        seenTitle = inTitle = true
        element.onEndTag(() => { budget(); inTitle = false })
      }
    } })
    .on('address,article,aside,blockquote,br,dd,div,dl,dt,footer,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,td,th,tr,ul', {
      element(element) {
        budget()
        if (excluded.length || element.hasAttribute('hidden')) return
        parts.push(' ')
        element.onEndTag(() => { budget(); if (!excluded.length) parts.push(' ') })
      },
    })
    .onDocument({ text(chunk) {
      budget(inTitle || !excluded.length ? chunk.text.length : 0)
      if (inTitle) {
        title += chunk.text
      } else if (!excluded.length) {
        node += chunk.text
        // A text node may span stream chunks, including in the middle of an entity.
        if (chunk.lastInTextNode) {
          parts.push(decodeHTML(node))
          node = ''
        }
      }
    } })
  // Cheap conservative admission checks stop pathological input before crossing
  // into the native parser. A callback exception alone can still make lol-html
  // scan the rest of its current large input chunk before surfacing the error.
  for (const [character, limit] of [['<', nativeEventLimit], ['&', 4096]] as const) {
    let cursor = -1
    let count = 0
    while ((cursor = html.indexOf(character, cursor + 1)) !== -1) {
      if (++count > limit) throw new Error(contentLimitReason)
    }
  }
  const transformed = rewriter.transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  const reader = transformed.body!.getReader()
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (!(await reader.read()).done) { /* Drain native parsing, discard serialized HTML. */ }
    return { text: normalizeText(parts.join('')), title: normalizeText(decodeHTML(title)).slice(0, 1000) || null }
  } finally {
    signal.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
  }
}

export async function checkWebsite(input: {
  domain: string
  required_text: string[]
  forbidden_text: string[]
  allowed_redirect_hosts: string[]
  baseline_title: string | null
}, fetcher: typeof fetch = fetch): Promise<MonitorCheckResult> {
  const started = performance.now()
  const result: MonitorCheckResult = {
    outcome: 'failure', reason: 'invalid_url', http_status: null,
    response_ms: 0, final_url: '', title: null, content_complete: false, available: null,
  }
  const finish = (outcome: MonitorCheckResult['outcome'], reason: string): MonitorCheckResult => ({
    ...result, outcome, reason, response_ms: Math.max(0, performance.now() - started),
  })
  let url: URL
  try {
    const domain = input.domain.trim()
    url = new URL(domain.includes('://') ? domain : `https://${domain}`)
    url.hash = ''
    result.final_url = url.href
    if (!safeUrl(url)) return finish('failure', 'unsafe_host_or_url')
  } catch {
    return finish('failure', 'invalid_url')
  }

  const initialHost = equivalentHost(url.hostname)
  const controller = new AbortController()
  let timedOut = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let response: Response | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
  })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Monitoring deadline exceeded', 'TimeoutError'))
  }, 10_000)
  const visited = new Set<string>()
  try {
    for (let redirects = 0; ; redirects++) {
      visited.add(url.href)
      result.final_url = url.href
      response = undefined
      const request = Promise.resolve(fetcher(url.href, { redirect: 'manual', signal: controller.signal }))
        .then(value => {
          if (controller.signal.aborted) cancelBody(value)
          return value
        })
      response = await Promise.race([request, deadline])
      result.http_status = response.status
      result.available = response.status >= 200 && response.status < 300
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      cancelBody(response)
      const location = response.headers.get('Location')
      if (!location) return finish('failure', 'redirect_location_missing')
      let target: URL
      try { target = new URL(location, url) } catch { return finish('failure', 'redirect_location_invalid') }
      target.hash = ''
      if (target.protocol === 'http:') return finish('failure', 'https_downgrade')
      if (!safeUrl(target)) return finish('failure', 'unsafe_redirect_host_or_url')
      if (equivalentHost(target.hostname) !== initialHost
        && !input.allowed_redirect_hosts.some(host => equivalentHost(host.trim()) === equivalentHost(target.hostname))) {
        return finish('failure', 'cross_domain_redirect')
      }
      if (visited.has(target.href)) return finish('failure', 'redirect_loop')
      if (redirects === 3) return finish('failure', 'redirect_limit')
      url = target
    }
    if (!result.available) return finish('failure', 'http_error')
    const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
    const needsContent = input.required_text.length > 0 || input.forbidden_text.length > 0 || input.baseline_title !== null
    if (mime !== 'text/html' && mime !== 'text/plain') {
      // A bodyless 2xx is a complete empty sample even without a MIME header.
      if (response.status !== 204 && (needsContent || response.body)) return finish(needsContent ? 'incomplete' : 'healthy', 'unsupported_content_type')
    }
    let body = ''
    let bytes = 0
    const decoder = new TextDecoder()
    reader = response.body?.getReader()
    if (reader) {
      for (;;) {
        const chunk = await Promise.race([reader.read(), deadline])
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > bodyByteLimit) return finish('incomplete', 'body_size_limit')
        if (mime === 'text/plain' && bytes > extractedTextLimit) {
          return finish('incomplete', contentLimitReason)
        }
        body += decoder.decode(chunk.value, { stream: true })
      }
    }
    body += decoder.decode()
    const content = mime === 'text/html'
      ? typeof HTMLRewriter === 'function'
        ? await Promise.race([nativeHtmlContent(body, controller.signal), deadline])
        : htmlContent(body)
      : { text: normalizeText(body), title: null }
    if (content.text.length > extractedTextLimit) return finish('incomplete', contentLimitReason)
    result.content_complete = true
    result.title = content.title
    const visible = content.text.toLowerCase()
    if (input.forbidden_text.some(term => visible.includes(normalizeText(term).toLowerCase()))) {
      return finish('failure', 'forbidden_text_found')
    }
    if (input.required_text.some(term => !visible.includes(normalizeText(term).toLowerCase()))) {
      return finish('failure', 'required_text_missing')
    }
    if (input.baseline_title !== null && (content.title || '') !== normalizeText(input.baseline_title)) {
      return finish('review', 'title_changed')
    }
    return finish('healthy', 'healthy')
  } catch (error) {
    const reason = timedOut ? 'timeout'
      : error instanceof Error && error.message === contentLimitReason ? contentLimitReason
      : error instanceof Error && error.name === 'AbortError' ? 'request_aborted'
        : reader ? 'body_read_error' : 'network_error'
    return finish(result.available === true ? 'incomplete' : 'failure', reason)
  } finally {
    clearTimeout(timer)
    // Cancellation can itself wait on a broken source; do not extend the deadline.
    if (reader) void reader.cancel().catch(() => {})
    else if (response && !response.body?.locked) cancelBody(response)
  }
}
