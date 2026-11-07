import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const store = new Map()
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: key => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key)
    }
})
const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom'
})
const { useAuth } = await server.ssrLoadModule('/src/utils/auth.ts')
const { issueSessionToken, verifyToken, checkAuth, checkApiToken } = await server.ssrLoadModule('/functions/utils/auth.ts')
const { validateDomain, normalizeDomain, isValidDate, todayShanghaiDate } = await server.ssrLoadModule('/functions/utils/domain-validation.ts')
const { encryptCredential, decryptCredential } = await server.ssrLoadModule('/functions/utils/credentials.ts')
const { onRequest: apiMiddleware } = await server.ssrLoadModule('/functions/[[path]].ts')

beforeEach(() => store.clear())
after(async () => {
    await server.close()
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
})

test('new login persists a token without a client expiration or password', () => {
    const auth = useAuth()
    auth.setAuthToken('test-session')
    assert.deepEqual(JSON.parse(atob(store.get('auth_token'))), { token: 'test-session' })
    assert.equal(auth.isAuthenticated.value, true)
})

test('a new auth instance reuses the existing browser login', () => {
    useAuth().setAuthToken('test-session')
    assert.deepEqual(useAuth().getAuthToken(), { token: 'test-session' })
})

test('legacy browser storage can still be read until the server rejects its unsigned session', () => {
    store.set('auth_token', btoa(JSON.stringify({ token: 'legacy-session', expiresAt: 1 })))
    const auth = useAuth()
    assert.deepEqual(auth.getAuthToken(), { token: 'legacy-session' })
    assert.equal(auth.isAuthenticated.value, true)
})

test('logout clears only the stored login', () => {
    const auth = useAuth()
    store.set('other-setting', 'keep')
    auth.setAuthToken('test-session')
    auth.clearAuth()
    assert.equal(auth.getAuthToken(), null)
    assert.equal(auth.isAuthenticated.value, false)
    assert.equal(store.get('other-setting'), 'keep')
})

test('a browser without site data is unauthenticated', () => {
    assert.equal(useAuth().getAuthToken(), null)
})

test('malformed stored data is removed rather than treated as a login', () => {
    store.set('auth_token', 'not-valid-base64!')
    assert.equal(useAuth().getAuthToken(), null)
    assert.equal(store.has('auth_token'), false)
})

test('missing or empty tokens do not bypass the login route', () => {
    for (const value of [null, {}, { token: '' }, { token: 123 }]) {
        store.set('auth_token', btoa(JSON.stringify(value)))
        assert.equal(useAuth().getAuthToken(), null)
        assert.equal(store.has('auth_token'), false)
    }
})

test('server session tokens are signed and bound to the configured username', async () => {
    const token = await issueSessionToken('admin', 'server-secret')
    const context = { request: new Request('https://example.test/api/domains', { headers: { Authorization: `Bearer ${token}` } }), env: { USER: 'admin', PASS: 'server-secret' } }
    assert.equal((await verifyToken(context)).success, true)
    assert.equal((await verifyToken({ ...context, env: { USER: 'other', PASS: 'server-secret' } })).success, false)
    assert.equal((await verifyToken({ ...context, env: { USER: 'admin', PASS: 'rotated-secret' } })).success, false)
    const [payload, signature] = token.split('.')
    const tamperedSignature = `${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`
    const tampered = `${payload}.${tamperedSignature}`
    assert.equal((await verifyToken({ ...context, request: new Request('https://example.test', { headers: { Authorization: `Bearer ${tampered}` } }) })).success, false)
})

test('API auth rejects a missing or unsigned bearer token', async () => {
    const response = await checkAuth({ request: new Request('https://example.test/api/domains', { headers: { Authorization: 'Bearer forged' } }), env: { USER: 'admin', PASS: 'server-secret' } })
    assert.equal(response.status, 401)
})

test('API_TOKEN is accepted only in the Authorization header, never in the URL', async () => {
    const env = { API_TOKEN: 'cron-secret' }
    const header = await checkApiToken({ request: new Request('https://example.test/api/check', { headers: { Authorization: 'Bearer cron-secret' } }), env })
    const query = await checkApiToken({ request: new Request('https://example.test/api/check?token=cron-secret'), env })
    assert.equal(header, null)
    assert.equal(query.status, 401)
    assert.equal(isValidDate(todayShanghaiDate()), true)
})

test('anonymous login reaches the login handler while protected APIs require a bearer token', async () => {
    let reached = false
    const loginResponse = await apiMiddleware({
        request: new Request('https://example.test/api/login', { method: 'POST' }),
        env: {},
        next: async () => { reached = true; return new Response('login handler') }
    })
    assert.equal(reached, true)
    assert.equal(await loginResponse.text(), 'login handler')

    reached = false
    const protectedResponse = await apiMiddleware({
        request: new Request('https://example.test/api/domains'),
        env: {},
        next: async () => { reached = true; return new Response('protected handler') }
    })
    assert.equal(reached, false)
    assert.equal(protectedResponse.status, 401)
})

test('AI sync context reads and writes both require API_TOKEN', async () => {
    let reached = false
    const missing = await apiMiddleware({
        request: new Request('https://example.test/api/ai/sync?website_id=1', { method: 'GET' }),
        env: { API_TOKEN: 'ai-secret' },
        next: async () => { reached = true; return new Response('sync handler') }
    })
    assert.equal(missing.status, 401)
    assert.equal(reached, false)

    const valid = await apiMiddleware({
        request: new Request('https://example.test/api/ai/sync?website_id=1', { method: 'GET', headers: { Authorization: 'Bearer ai-secret' } }),
        env: { API_TOKEN: 'ai-secret' },
        next: async () => { reached = true; return new Response('sync handler') }
    })
    assert.equal(await valid.text(), 'sync handler')
    assert.equal(reached, true)
})

test('domain validation only checks domain asset fields', () => {
    assert.equal(normalizeDomain(' Example.COM. '), 'example.com')
    assert.equal(isValidDate('2024-02-29'), true)
    assert.equal(isValidDate('2025-02-29'), false)
    const valid = { domain: 'example.com', registrar: 'test', registrar_date: '2025-01-01', expiry_date: '2027-01-01', service_type: '正常网站', status: '在线' }
    assert.equal(validateDomain(valid), null)
    assert.match(validateDomain({ ...valid, registrar_date: '2025-02-29' }), /有效的 YYYY-MM-DD/)
})

test('credential ciphertext is authenticated and requires a strong configured secret', async () => {
    const token = 'github-token-value'
    const secret = '0123456789abcdef0123456789abcdef'
    const encrypted = await encryptCredential(token, secret)
    assert.notEqual(encrypted, token)
    assert.equal(await decryptCredential(encrypted, secret), token)
    await assert.rejects(() => decryptCredential(encrypted, 'wrong-secret-0123456789abcdef'))
    await assert.rejects(() => encryptCredential(token, 'short'))
})
