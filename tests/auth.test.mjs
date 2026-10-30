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

test('legacy sessions remain logged in after their old six-hour deadline', () => {
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
