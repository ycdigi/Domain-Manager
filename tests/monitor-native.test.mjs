import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
const bundle = await build({ bundle: true, write: false, format: 'esm', platform: 'browser', stdin: {
  resolveDir: process.cwd(), contents: `
    import { checkWebsite } from './shared/site-monitor.ts'
    export default { async fetch() {
      const methods = []; let cancelled = false; let chunks = 0
      const result = await checkWebsite({ domain: 'example.com', allowed_redirect_hosts: [] }, async (_url, options) => {
        methods.push(options.method)
        const body = new ReadableStream({
          pull(controller) { chunks++; controller.enqueue(new TextEncoder().encode(chunks === 1 ? '<head><title>Domain &amp; &#x505c;&#x653e;</title></head>' : 'rest of large page')) },
          cancel() { cancelled = true }
        })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html', 'Content-Length': '999999999' } })
      })
      return Response.json({ result, methods, cancelled, chunks })
    } }
  `,
} })
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-01-01' })
after(() => runtime.dispose())
test('Cloudflare fetches and decodes the page title then cancels the rest of the response', async () => {
  const data = await (await runtime.dispatchFetch('http://localhost/')).json()
  assert.deepEqual(data.methods, ['GET'])
  assert.equal(data.result.outcome, 'healthy')
  assert.equal(data.result.http_status, 200)
  assert.equal(data.result.content_complete, false)
  assert.equal(data.result.title, 'Domain & 停放')
  assert.equal(data.cancelled, true)
  assert.ok(data.chunks <= 2)
})
