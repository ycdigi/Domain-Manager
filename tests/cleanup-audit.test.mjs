import test from 'node:test'
import assert from 'node:assert/strict'
import { missingCssClasses } from '../scripts/css-sources.mjs'

test('状态类需要实际来源，不能按前缀跳过', () => {
  assert.deepEqual(missingCssClasses('.is-unused { color: red }', '<div class="page" />'), ['is-unused'])
})
test('模板对象、拼接类及明确的组件库类有来源', () => {
  const source = `<div :class="{ 'is-removed': removed }" :class="'stage-' + stage" />`
  assert.deepEqual(missingCssClasses('.is-removed {} .stage-active {} .is-disabled {}', source, new Set(['is-disabled'])), [])
})
