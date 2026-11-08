import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQueue, buildVisitUrl, classifyResponse, mergeSourceResult } from '../scripts/link-source-review-worker.mjs'

test('worker creates one visit for every active website and source', () => {
  const queue = buildQueue([
    { id: 1, lifecycle: 'active', domains: [{ domain: 'one.example', is_primary: 1 }] },
    { id: 2, lifecycle: 'stopped', domains: [{ domain: 'two.example', is_primary: 1 }] }
  ], [
    { id: 10, source_url: 'https://directory.example/page' },
    { id: 11, source_url: 'https://directory.example/submit', url_template: 'https://directory.example/submit?url={{target_url}}' }
  ])
  assert.equal(queue.length, 2)
  assert.equal(queue[1].source_url, 'https://directory.example/submit?url=https%3A%2F%2Fone.example')
})

test('worker resumes completed combinations from local state', () => {
  const queue = buildQueue([{ id: 1, lifecycle: 'active', domains: [{ domain: 'one.example', is_primary: 1 }] }], [{ id: 10, source_url: 'https://directory.example' }], { '1:10': { completed_at: '2026-11-08T00:00:00.000Z' } })
  assert.deepEqual(queue, [])
})

test('worker maps browser results to funnel check states', () => {
  assert.equal(classifyResponse({ status: 200, requestedUrl: 'https://example.test', finalUrl: 'https://example.test' }).check_status, '可访问')
  assert.equal(classifyResponse({ status: 404 }).check_status, '404')
  assert.equal(classifyResponse({ status: 403 }).check_status, '受阻')
  assert.equal(classifyResponse({ error: 'Timeout 30000ms exceeded' }).check_status, '超时')
})

test('worker aggregates all website visits into one source result', () => {
  const first = mergeSourceResult(null, { source_id: 10, check_status: '404', http_status: 404, checked_url: 'https://source.test', checked_at: '2026-11-08T00:00:00Z', error_message: null })
  const merged = mergeSourceResult(first, { source_id: 10, check_status: '可访问', http_status: 200, checked_url: 'https://source.test?url=site', checked_at: '2026-11-08T00:01:00Z', error_message: null })
  assert.equal(merged.check_status, '可访问')
  assert.equal(merged.attempt_count, 2)
  assert.equal(merged.accessible_count, 1)
})
