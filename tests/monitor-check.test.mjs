import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(() => server.close())
// Load inside tests so a missing checker reports the unimplemented behavior.
const check = async (overrides = {}, fetcher) => {
  const { checkWebsite } = await server.ssrLoadModule('/shared/site-monitor.ts')
  return checkWebsite({ domain: 'example.com', required_text: [], forbidden_text: [], allowed_redirect_hosts: [], baseline_title: null, ...overrides }, fetcher)
}
const html = (body = '<title>Example</title><p>Hello world</p>', status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const redirect = location => new Response('redirect body', { status: 302, headers: { Location: location } })
const stream = chunks => {
  let canceled = false
  const body = new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)) },
    cancel() { canceled = true },
  })
  return { response: new Response(body, { headers: { 'Content-Type': 'text/html' } }), canceled: () => canceled }
}

test('healthy HTTPS sample returns the exact result contract and first title', async () => {
  const result = await check({}, async (url, options) => {
    assert.equal(String(url), 'https://example.com/')
    assert.equal(options.redirect, 'manual')
    assert.ok(options.signal instanceof AbortSignal)
    return html()
  })
  assert.deepEqual(Object.keys(result).sort(), ['outcome', 'reason', 'http_status', 'response_ms', 'final_url', 'title', 'content_complete', 'available'].sort())
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.http_status, 200)
  assert.equal(result.title, 'Example')
  assert.equal(result.final_url, 'https://example.com/')
  assert.equal(result.content_complete, true)
  assert.equal(result.available, true)
  assert.ok(Number.isFinite(result.response_ms) && result.response_ms >= 0)
  assert.ok(result.reason.length)
})

for (const status of [403, 404, 500]) test(`HTTP ${status} is unavailable even when content matches`, async () => {
  const response = stream(['<p>Hello</p>'])
  const result = await check({ required_text: ['Hello'] }, async () => new Response(response.response.body, { status }))
  assert.equal(result.outcome, 'failure')
  assert.equal(result.http_status, status)
  assert.equal(result.available, false)
  assert.equal(response.canceled(), true)
})

test('only 2xx responses establish availability', async () => {
  for (const [status, outcome, available] of [[204, 'healthy', true], [304, 'failure', false]]) {
    const result = await check({}, async () => new Response(null, { status }))
    assert.equal(result.outcome, outcome)
    assert.equal(result.available, available)
  }
})

test('follows three manual redirects including relative paths and main/www equivalence', async () => {
  const urls = []
  const result = await check({}, async (url, options) => {
    urls.push(String(url))
    assert.equal(options.redirect, 'manual')
    return [redirect('https://www.example.com/one'), redirect('/two'), redirect('/three'), html()][urls.length - 1]
  })
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.final_url, 'https://www.example.com/three')
  assert.equal(urls.length, 4)
})

test('does not fetch a fourth redirect target and cancels redirect bodies', async () => {
  const urls = []
  const bodies = []
  const result = await check({}, async url => {
    urls.push(String(url))
    const body = stream(['unused'])
    bodies.push(body)
    return new Response(body.response.body, { status: 301, headers: { Location: `/hop${urls.length}` } })
  })
  assert.equal(result.outcome, 'failure')
  assert.match(result.reason, /redirect.*limit/i)
  assert.equal(urls.length, 4)
  assert.ok(bodies.every(body => body.canceled()))
})

test('detects redirect loops ignoring URL fragments', async () => {
  let calls = 0
  const result = await check({}, async () => { calls++; return redirect('/#other') })
  assert.equal(result.outcome, 'failure')
  assert.match(result.reason, /loop/i)
  assert.equal(calls, 1)
})

test('blocks cross-domain redirects without fetching the target', async () => {
  let calls = 0
  const result = await check({}, async () => { calls++; return redirect('https://login.other.com/') })
  assert.equal(result.outcome, 'failure')
  assert.equal(result.available, false)
  assert.match(result.reason, /cross.*domain/i)
  assert.equal(calls, 1)
})

test('explicitly allowed redirect hosts are followed but suffix matches are blocked', async () => {
  for (const [target, count, outcome] of [['https://other.com/', 2, 'healthy'], ['https://other.com.evil.com/', 1, 'failure']]) {
    let calls = 0
    const result = await check({ allowed_redirect_hosts: ['other.com'] }, async () => ++calls === 1 ? redirect(target) : html())
    assert.equal(result.outcome, outcome)
    assert.equal(calls, count)
  }
})

test('flags an HTTP downgrade without fetching or falling back', async () => {
  let calls = 0
  const result = await check({}, async () => { calls++; return redirect('http://example.com/') })
  assert.equal(result.outcome, 'failure')
  assert.match(result.reason, /downgrade/i)
  assert.equal(calls, 1)
})

test('rejects IP, private, local and credentialed input hosts before fetching', async () => {
  for (const domain of ['127.0.0.1', '2130706433', '0x7f000001', '10.0.0.1', '[::1]', '[2001:4860:4860::8888]', '8.8.8.8', 'localhost', 'foo.localhost', 'foo.local', 'foo.internal', 'intranet', 'https://user:pass@example.com', 'http://example.com', 'https://example.com:8080']) {
    let calls = 0
    const result = await check({ domain }, async () => { calls++; return html() })
    assert.equal(result.outcome, 'failure', domain)
    assert.equal(result.available, null, domain)
    assert.equal(calls, 0, domain)
  }
})

test('unsafe redirect hosts are rejected even when explicitly allowed', async () => {
  for (const host of ['127.0.0.1', '[::ffff:127.0.0.1]', 'localhost', 'foo.local', 'foo.internal', 'intranet']) {
    let calls = 0
    const result = await check({ allowed_redirect_hosts: [host] }, async () => { calls++; return redirect(`https://${host}/`) })
    assert.equal(result.outcome, 'failure', host)
    assert.equal(calls, 1, host)
  }
})

test('keyword rules use decoded visible text, excluding all noncontent markup', async () => {
  const body = '<head><title>Hidden title</title><meta content="secret"></head><!-- secret --><script>secret</script><style>secret</style><template><p>secret</p></template><noscript>secret</noscript><p data-x="secret">HELLO &copy; &eacute; &#x1F600; &#128; &NotEqualTilde; &nbsp; World</p>'
  const result = await check({ required_text: ['hello © é 😀 € ≂̸ world'], forbidden_text: ['secret', 'Hidden title'] }, async () => html(body))
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.title, 'Hidden title')
})

test('script text with fake closing markup cannot leak into keyword matches', async () => {
  const result = await check({ forbidden_text: ['secret'] }, async () => html('<head><script>"</head><p>secret</p>"</script></head><p>safe</p>'))
  assert.equal(result.outcome, 'healthy')
})

test('entities cannot be invented by joining separate text nodes', async () => {
  const result = await check({ required_text: ['&copy;'], forbidden_text: ['©'] }, async () => html('<p>&co<span>py;</span></p>'))
  assert.equal(result.outcome, 'healthy')
})

test('hidden attribute excludes entire nested subtrees, including hidden=false', async () => {
  const body = '<div hidden><div>secret</div>still secret<script>"</div>"</script><img>secret</div><p HIDDEN="false">secret</p><section hidden="until-found">secret</section><p>visible</p>'
  const result = await check({ required_text: ['visible'], forbidden_text: ['secret'] }, async () => html(body))
  assert.equal(result.outcome, 'healthy')
})

test('hidden text cannot satisfy required keywords', async () => {
  const result = await check({ required_text: ['secret'] }, async () => html('<p hidden>secret</p><p>visible</p>'))
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason, 'required_text_missing')
})

test('hidden lookalikes in attributes and hidden void elements do not suppress visible siblings', async () => {
  const body = '<p data-hidden title="some hidden text">one</p><img hidden><input hidden=""><br hidden><p>two</p><p title="hidden" hiddenish>three</p>'
  const result = await check({ required_text: ['one', 'two', 'three'] }, async () => html(body))
  assert.equal(result.outcome, 'healthy')
})

test('missing required text and visible forbidden text each fail case insensitively', async () => {
  for (const rules of [{ required_text: ['absent'] }, { forbidden_text: ['WORLD'] }, { required_text: ['secret'] }]) {
    const result = await check(rules, async () => html('<script>secret</script><p>Hello world</p>'))
    assert.equal(result.outcome, 'failure')
    assert.equal(result.available, true)
    assert.equal(result.content_complete, true)
  }
})

test('plain text keeps literal markup and does not decode HTML entities', async () => {
  const result = await check({ required_text: ['<script>hello</script>', '&copy;'] }, async () => new Response('<script>HELLO</script> &copy;', { headers: { 'Content-Type': 'text/plain' } }))
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.title, null)
})

test('normalizes and decodes the title, reviewing changes including missing titles', async () => {
  for (const [body, outcome, title] of [['<title> Example &amp;\n Co </title>', 'healthy', 'Example & Co'], ['<title>New</title>', 'review', 'New'], ['<p>No title</p>', 'review', null]]) {
    const result = await check({ baseline_title: 'Example & Co' }, async () => html(body))
    assert.equal(result.outcome, outcome)
    assert.equal(result.title, title)
  }
})

test('an omitted head end tag does not hide body text', async () => {
  const result = await check({ required_text: ['Welcome'] }, async () => html('<head><title>T</title><body><p>Welcome</p>'))
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.title, 'T')
})

test('empty baseline accepts absent or empty titles and reviews a newly introduced title', async () => {
  for (const body of ['<p>Welcome</p>', '<title>  </title><p>Welcome</p>']) {
    const result = await check({ baseline_title: '' }, async () => html(body))
    assert.equal(result.outcome, 'healthy')
    assert.equal(result.title, null)
  }
  const changed = await check({ baseline_title: '' }, async () => html('<title>New title</title>'))
  assert.equal(changed.outcome, 'review')
  assert.equal(changed.reason, 'title_changed')
})

test('a bodyless 204 with an accepted absent-title baseline is complete and healthy', async () => {
  const result = await check({ baseline_title: '' }, async () => new Response(null, { status: 204 }))
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.title, null)
  assert.equal(result.content_complete, true)
})

test('caps decoded normalized titles at 1000 characters and reuses the capped first baseline', async () => {
  const body = `<title>  ${'&eacute;'.repeat(1000)} overflow </title><p>Hello</p>`
  const first = await check({}, async () => html(body))
  assert.equal(first.outcome, 'healthy')
  assert.equal(first.title, 'é'.repeat(1000))
  const next = await check({ baseline_title: first.title }, async () => html(body))
  assert.equal(next.outcome, 'healthy')
  assert.equal(next.title.length, 1000)
  const changed = await check({ baseline_title: first.title }, async () => html('<title>Changed</title>'))
  assert.equal(changed.outcome, 'review')
  assert.equal(changed.reason, 'title_changed')
})

test('unsupported MIME is incomplete only when content rules or a title baseline need it', async () => {
  for (const rules of [{}, { required_text: ['hello'] }, { forbidden_text: ['bad'] }, { baseline_title: 'Example' }]) {
    const source = stream(['hello'])
    const result = await check(rules, async () => new Response(source.response.body, { headers: { 'Content-Type': 'application/pdf' } }))
    assert.equal(result.outcome, Object.keys(rules).length ? 'incomplete' : 'healthy')
    assert.equal(result.content_complete, false)
    assert.equal(result.available, true)
    assert.equal(source.canceled(), true)
  }
})

test('an empty unsupported representation cannot establish that content rules passed or failed', async () => {
  const result = await check({ required_text: ['hello'] }, async () => new Response(null, { headers: { 'Content-Type': 'application/pdf' } }))
  assert.equal(result.outcome, 'incomplete')
  assert.equal(result.content_complete, false)
  assert.equal(result.available, true)
})

test('streams at most 64 KiB, cancels the body, and never fails missing rules on a partial sample', async () => {
  const source = stream(['<p>Hello</p>', 'x'.repeat(64 * 1024), '<p>required</p>'])
  const result = await check({ required_text: ['required'] }, async () => source.response)
  assert.equal(result.outcome, 'incomplete')
  assert.equal(result.available, true)
  assert.equal(result.content_complete, false)
  assert.equal(result.reason, 'body_size_limit')
  assert.equal(source.canceled(), true)
})

test('a complete HTML body of exactly 64 KiB is accepted and streaming UTF-8 stays intact', async () => {
  const visible = '<p>' + 'é'.repeat(1000) + '</p><script>'
  const padding = 64 * 1024 - new TextEncoder().encode(visible + '</script>').length
  const bytes = new TextEncoder().encode(visible + 'x'.repeat(padding) + '</script>')
  let offset = 0
  const body = new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return }
    controller.enqueue(bytes.slice(offset, offset += Math.min(1023, bytes.length - offset)))
  } })
  const result = await check({ required_text: ['ééé'], forbidden_text: ['�'] }, async () => new Response(body, { headers: { 'Content-Type': 'text/html' } }))
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.content_complete, true)
})

test('body read failures preserve HTTP availability but mark content incomplete', async () => {
  const result = await check({ required_text: ['hello'] }, async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('connection reset')) } }), { headers: { 'Content-Type': 'text/html' } }))
  assert.equal(result.outcome, 'incomplete')
  assert.equal(result.available, true)
  assert.equal(result.http_status, 200)
  assert.equal(result.content_complete, false)
  assert.match(result.reason, /body/i)
})

test('network and externally aborted fetches are not mislabeled as timeouts or retried over HTTP', async () => {
  for (const [error, reason] of [[new TypeError('TLS failed'), /network/i], [new DOMException('canceled', 'AbortError'), /abort/i]]) {
    let calls = 0
    const result = await check({}, async () => { calls++; throw error })
    assert.equal(result.outcome, 'failure')
    assert.equal(result.available, null)
    assert.equal(result.http_status, null)
    assert.match(result.reason, reason)
    assert.doesNotMatch(result.reason, /timeout/i)
    assert.equal(calls, 1)
  }
})

test('ten-second timeout covers fetch, aborts it, and cancels even a late response', async t => {
  await server.ssrLoadModule('/shared/site-monitor.ts')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let signal, resolveFetch
  const entered = new Promise(resolve => {
    resolveFetch = resolve
  })
  let finish
  const pending = check({}, async (_url, options) => {
    signal = options.signal
    resolveFetch()
    return new Promise(resolve => { finish = resolve })
  })
  await entered
  t.mock.timers.tick(10_000)
  const result = await pending
  assert.equal(result.outcome, 'failure')
  assert.match(result.reason, /timeout/i)
  assert.equal(signal.aborted, true)
  const source = stream(['late'])
  finish(source.response)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(source.canceled(), true)
})

test('one deadline spans redirects and body reading, including streams ignoring abort', async t => {
  await server.ssrLoadModule('/shared/site-monitor.ts')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0, ready
  const reading = new Promise(resolve => { ready = resolve })
  const source = stream(['<p>Hello</p>'])
  const pending = check({ required_text: ['missing'] }, async () => {
    if (++calls === 1) { t.mock.timers.tick(6_000); return redirect('/next') }
    ready()
    return source.response
  })
  await reading
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(4_000)
  const result = await pending
  assert.equal(result.outcome, 'incomplete')
  assert.match(result.reason, /timeout/i)
  assert.equal(result.available, true)
  assert.equal(result.http_status, 200)
  assert.equal(source.canceled(), true)
})


test('plain text stops above 8 KiB before reporting a missing keyword', async () => {
  for (const [size, outcome] of [[8 * 1024, 'healthy'], [8 * 1024 + 1, 'incomplete']]) {
    const result = await check({ required_text: ['xxx'] }, async () => new Response('x'.repeat(size), { headers: { 'Content-Type': 'text/plain' } }))
    assert.equal(result.outcome, outcome)
    assert.equal(result.available, true)
    assert.equal(result.content_complete, outcome === 'healthy')
    if (outcome === 'incomplete') assert.equal(result.reason, 'content_extraction_limit')
  }
})

test('portable HTML extraction stops above 8 KiB without evaluating missing keywords', async () => {
  const result = await check({ required_text: ['absent'] }, async () => html('<p>' + 'x'.repeat(8 * 1024 + 1) + '</p>'))
  assert.equal(result.outcome, 'incomplete')
  assert.equal(result.reason, 'content_extraction_limit')
  assert.equal(result.content_complete, false)
  assert.equal(result.available, true)
})

test('portable parser rejects more than 256 markup events as incomplete', async () => {
  const result = await check({ required_text: ['absent'] }, async () => html('<p>x</p>'.repeat(129)))
  assert.equal(result.outcome, 'incomplete')
  assert.equal(result.reason, 'content_extraction_limit')
  assert.equal(result.content_complete, false)
})
