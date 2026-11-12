import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
const bundle = await build({ bundle: true, write: false, format: 'esm', platform: 'browser', stdin: {
  resolveDir: process.cwd(), contents: `
    import { checkWebsite } from './shared/site-monitor.ts'
    export default { async fetch() {
      globalThis.HTMLRewriter = class { constructor() { throw new Error('HTML parsing is forbidden') } }
      const methods = []; let cancelled = false
      const result = await checkWebsite({ domain: 'example.com', allowed_redirect_hosts: [] }, async (_url, options) => {
        methods.push(options.method)
        if (options.method === 'HEAD') return new Response(null, { status: 405 })
        const body = new ReadableStream({ cancel() { cancelled = true } })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html', 'Content-Length': '999999999' } })
      })
      return Response.json({ result, methods, cancelled })
    } }
  `,
} })
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-01-01' })
after(() => runtime.dispose())
test('Cloudflare checks HEAD/GET response headers without HTML parsing or body size limits', async () => {
  const data = await (await runtime.dispatchFetch('http://localhost/')).json()
  assert.deepEqual(data.methods, ['HEAD', 'GET'])
  assert.equal(data.result.outcome, 'healthy')
  assert.equal(data.result.http_status, 200)
  assert.equal(data.result.content_complete, false)
  assert.equal(data.result.title, null)
  assert.equal(data.cancelled, true)
})
