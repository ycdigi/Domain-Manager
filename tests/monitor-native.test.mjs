import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

// Run the actual bundled checker in workerd, using its native HTMLRewriter.
const bundle = await build({ bundle: true, write: false, format: 'esm', platform: 'browser', stdin: {
  resolveDir: process.cwd(), contents: `
    import { checkWebsite } from './shared/site-monitor.ts'
    const NativeRewriter = HTMLRewriter
    let nativeCalls = 0
    globalThis.HTMLRewriter = class extends NativeRewriter {
      constructor() { super(); nativeCalls++ }
    }
    export default { async fetch(request) {
      const { pages, rounds = 1 } = await request.json()
      const timings = []
      let results
      const before = nativeCalls
      for (let round = 0; round < rounds; round++) {
        const start = performance.now()
        results = []
        for (const page of pages) {
          results.push(await checkWebsite({ domain: 'example.com', required_text: [], forbidden_text: [],
            allowed_redirect_hosts: [], baseline_title: null, ...page.rules },
            async () => new Response(page.html, { headers: { 'Content-Type': page.mime || 'text/html' } })))
        }
        timings.push(performance.now() - start)
      }
      return Response.json({ results, timings, nativeCalls: nativeCalls - before })
    } }
  `,
} })
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-01-01' })
after(() => runtime.dispose())
const run = async (pages, rounds = 1) => (await runtime.dispatchFetch('http://localhost/', {
  method: 'POST', body: JSON.stringify({ pages, rounds }),
})).json()

test('native parser handles implied head closure, excluded subtrees, entities, and no-title baseline', async () => {
  const pages = [
    { html: '<head><title>T &amp; Co</title><body><p>Welcome &copy;</p>', rules: { required_text: ['Welcome ©'], baseline_title: 'T & Co' } },
    { html: '<head><title>Hidden title</title><script>"</head>secret"</script><body><template><p>secret</p></template><div hidden><div>secret</div>secret</div><noscript>secret</noscript><style>secret</style><p>Visible &NotEqualTilde;</p>', rules: { required_text: ['Visible ≂̸'], forbidden_text: ['secret', 'Hidden title'] } },
    { html: '<p>Welcome</p>', rules: { baseline_title: '' } },
    { html: '<title>New</title>', rules: { baseline_title: '' } },
    { html: '<p>&co<span>py;</span></p>', rules: { required_text: ['&copy;'], forbidden_text: ['©'] } },
  ]
  const batch = await run(pages)
  assert.equal(batch.nativeCalls, 5)
  assert.deepEqual(batch.results.map(result => result.outcome), ['healthy', 'healthy', 'healthy', 'review', 'healthy'])
  assert.equal(batch.results[0].title, 'T & Co')
})

test('native extraction budgets return incomplete instead of false missing-keyword failures', async () => {
  const pages = [
    { html: '<p>x</p>'.repeat(6 * 1024), rules: { required_text: ['absent'] } },
    { html: '<p>' + '&copy;'.repeat(3000) + '</p>', rules: { required_text: ['absent'] } },
    { html: '<p>' + 'x'.repeat(8 * 1024 + 1) + '</p>', rules: { required_text: ['absent'] } },
    { html: '<p>x</p>'.repeat(100), rules: { required_text: ['absent'] } },
  ]
  const batch = await run(pages)
  assert.equal(batch.nativeCalls, 4)
  for (const result of batch.results) {
    assert.equal(result.outcome, 'incomplete')
    assert.equal(result.content_complete, false)
    assert.equal(result.available, true)
    assert.match(result.reason, /limit/)
    assert.equal(result.reason, 'content_extraction_limit')
  }
})

test('Workers plain text shares the 8 KiB extraction limit before evaluating content rules', async () => {
  const pages = [
    { html: 'x'.repeat(64 * 1024), mime: 'text/plain', rules: { required_text: Array.from({ length: 20 }, (_, i) => 'keyword' + i) } },
    { html: 'x'.repeat(8 * 1024 + 1), mime: 'text/plain', rules: { forbidden_text: ['bad'] } },
    { html: 'x'.repeat(8 * 1024), mime: 'text/plain', rules: { required_text: ['xxx'] } },
  ]
  const batch = await run(pages)
  assert.equal(batch.nativeCalls, 0)
  assert.deepEqual(batch.results.map(result => result.outcome), ['incomplete', 'incomplete', 'healthy'])
  for (const result of batch.results.slice(0, 2)) {
    assert.equal(result.reason, 'content_extraction_limit')
    assert.equal(result.content_complete, false)
    assert.equal(result.available, true)
  }
})

test('workerd measures one-site invocations with representative and bounded pathological pages', async t => {
  const pad = '<script>' + 'x'.repeat(48 * 1024) + '</script>'
  const scenarios = [
    ['representative', { html: '<head><title>News</title>' + pad + '<body>'
      + '<article><h2>Headline</h2><p>Welcome reader &copy;</p></article>'.repeat(16),
      rules: { required_text: ['Welcome reader ©'], baseline_title: 'News' } }, 'healthy'],
    ['pathological', { html: '<p>x</p>'.repeat(6 * 1024), rules: { required_text: ['absent'] } }, 'incomplete'],
    ['plain', { html: 'x'.repeat(48 * 1024), mime: 'text/plain',
      rules: { required_text: Array.from({ length: 20 }, (_, index) => 'keyword' + index) } }, 'incomplete'],
    ['body limit', { html: '<script>' + 'x'.repeat(64 * 1024) + '</script>', rules: {} }, 'incomplete'],
  ]
  for (const [name, page, outcome] of scenarios) {
    for (let warm = 0; warm < 3; warm++) await run([page])
    const timings = []
    for (let sample = 0; sample < 20; sample++) {
      // Separate dispatches: exactly one check per Worker invocation, as in Cron.
      const batch = await run([page])
      assert.equal(batch.results.length, 1)
      assert.equal(batch.results[0].outcome, outcome)
      assert.equal(batch.results[0].available, true)
      if (outcome === 'incomplete') {
        assert.equal(batch.results[0].content_complete, false)
        assert.equal(batch.results[0].reason, name === 'body limit' ? 'body_size_limit' : 'content_extraction_limit')
      }
      timings.push(batch.timings[0])
    }
    const sorted = timings.toSorted((a, b) => a - b)
    t.diagnostic(name + ' one-site workerd elapsed ms (not deployed CPU): '
      + JSON.stringify({ median: sorted[10], p95: sorted[18], max: sorted[19] }))
  }
})
