import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { createServer } from 'vite'
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom'
})
after(() => server.close())
test('favicon downloads a declared image and rejects private DNS or oversized content', async () => {
  const { fetchFavicon } = await server.ssrLoadModule('/functions/domain/favicons.ts')
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])
  const fetcher = async (url) =>
    String(url).startsWith('https://cloudflare-dns.com')
      ? Response.json({ Answer: [{ type: 1, data: '93.184.216.34' }] })
      : String(url).endsWith('/logo.png')
        ? new Response(png, { headers: { 'Content-Type': 'image/png' } })
        : new Response('<link rel="icon" href="/logo.png">')
  const image = await fetchFavicon('example.com', fetcher)
  assert.equal(image.mime_type, 'image/png')
  assert.equal(image.source_url, 'https://example.com/logo.png')
  await assert.rejects(() => fetchFavicon('127.0.0.1', fetcher))
  await assert.rejects(() =>
    fetchFavicon('example.com', async () => Response.json({ Answer: [{ type: 1, data: '10.0.0.1' }] }))
  )
  await assert.rejects(() =>
    fetchFavicon('example.com', async (url) =>
      String(url).startsWith('https://cloudflare-dns.com')
        ? Response.json({ Answer: [{ type: 1, data: '93.184.216.34' }] })
        : new Response(new Uint8Array(300000), { headers: { 'Content-Type': 'image/png' } })
    )
  )
})
test('cached favicons avoid repeated fetches and failed refresh keeps the existing image', async () => {
  const { database } = await import('./helpers/database.mjs')
  const store = database()
  const { cacheDomainFavicon } = await server.ssrLoadModule('/functions/domain/favicons.ts')
  try {
    store.init()
    store.sql(
      "INSERT INTO websites(name) VALUES('site'); INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(1,'example.com','r','2026-01-01','2027-01-01','网站');"
    )
    let calls = 0
    const fetcher = async (url) => {
      calls++
      return String(url).startsWith('https://cloudflare-dns.com')
        ? Response.json({ Answer: [{ type: 1, data: '93.184.216.34' }] })
        : String(url).endsWith('favicon.ico')
          ? new Response(new Uint8Array([0, 0, 1, 0, 1]))
          : new Response('<head></head>')
    }
    await cacheDomainFavicon(store.db, 1, false, fetcher)
    const first = store.sql('SELECT image_data FROM domain_favicons')[0].image_data
    assert.ok(first)
    const requests = calls
    await cacheDomainFavicon(store.db, 1, false, fetcher)
    assert.equal(calls, requests)
    await cacheDomainFavicon(store.db, 1, true, async () => {
      throw new Error('offline')
    })
    assert.equal(store.sql('SELECT image_data FROM domain_favicons')[0].image_data, first)
    store.sql("UPDATE domains SET domain='changed.com' WHERE id=1")
    await cacheDomainFavicon(store.db, 1, false, async () => {
      throw new Error('offline')
    })
    assert.equal(store.sql('SELECT image_data FROM domain_favicons')[0].image_data, null)
    const failingCalls = []
    await cacheDomainFavicon(store.db, 1, false, async (url) => {
      failingCalls.push(url)
      throw new Error('offline')
    })
    assert.equal(failingCalls.length, 0)
  } finally {
    store.close()
  }
})
