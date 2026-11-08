#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const item = process.argv[index]
  if (item.startsWith('--')) args.set(item.slice(2), process.argv[index + 1] || '')
}

const input = args.get('input')
const output = args.get('output') || 'link-sources-audit.json'
const csvOutput = args.get('csv-output')
if (!input) {
  console.error('用法: node scripts/audit-link-sources.mjs --input links.txt --output link-sources-audit.json [--csv-output link-sources-audit.csv]')
  process.exit(1)
}

const typeKeywords = [
  ['SEO 查询页', ['alexa', 'pagerank', 'whois', 'indexed', 'backlink', 'seo', 'rank', 'domaininfo']],
  ['工具目录', ['directory', 'catalog', 'listing', 'tool', 'submit']],
  ['行业资源页', ['resource', 'association', 'industry', 'community']],
  ['社区页面', ['forum', 'thread', 'reddit', 'discussion', 'community']],
  ['搜索页', ['search', 'query', 's=', 'q=', 'keyword', 'wd=', 'query=']]
]
const classify = value => {
  const text = value.toLowerCase()
  const match = typeKeywords.find(([, keywords]) => keywords.some(keyword => text.includes(keyword)))
  return match?.[0] || '无法判断'
}
const clean = value => String(value).trim().replace(/^\uFEFF/, '')
const decodeHtml = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
const normalize = value => {
  const flags = []
  const original = clean(value)
  if (!original) return { original, source_url: null, url_template: null, valid: false, source_type: '无法判断', audit_flags: ['空行'], error: '来源地址为空' }
  let template = decodeHtml(original).replaceAll('***', '{{target_url}}').replace(/,+$/, '')
  if (template !== original) flags.push('已转换占位符或 HTML 编码')
  if (/[\s,]$/.test(original)) flags.push('包含尾部标点')
  if (/^http:\/\//i.test(template)) flags.push('旧 HTTP 地址')
  if (!template.includes('{{target_url}}')) flags.push('缺少 {{target_url}} 占位符')
  const hostPart = template.match(/^https?:\/\/([^/?#]+)/i)?.[1] || ''
  if (hostPart.includes('{{target_url}}')) flags.push('占位符位于主机名')
  let sourceUrl = null
  try {
    const parsed = new URL(template.replace('{{target_url}}', 'https%3A%2F%2Fexample.com'))
    if (!['http:', 'https:'].includes(parsed.protocol)) flags.push('协议不受支持')
    else if (!hostPart.includes('{{target_url}}')) sourceUrl = parsed.origin
  } catch { flags.push('URL 格式无效') }
  const structuralFlags = new Set(['缺少 {{target_url}} 占位符', '占位符位于主机名', '协议不受支持', 'URL 格式无效'])
  const valid = Boolean(sourceUrl && template.includes('{{target_url}}') && !flags.some(flag => structuralFlags.has(flag)))
  return { original, source_url: sourceUrl, url_template: template, valid, source_type: classify(template), audit_flags: flags, error: valid ? null : '模板需要人工审核或无法导入' }
}

const contents = await fs.readFile(input, 'utf8')
const seen = new Set()
const rows = []
for (const line of contents.split(/\r?\n/)) {
  const row = normalize(line)
  if (!row.original) continue
  const key = `${row.source_url || ''}\u0000${row.url_template || row.original}`
  if (seen.has(key)) row.audit_flags.push('重复模板')
  seen.add(key)
  rows.push({ ...row, approval_status: '待审核', submission_mode: '仅观察', enabled: 0 })
}
const result = { generated_at: new Date().toISOString(), input: path.resolve(input), total: rows.length, valid: rows.filter(row => row.valid).length, invalid: rows.filter(row => !row.valid).length, duplicates: rows.filter(row => row.audit_flags.includes('重复模板')).length, rows }
await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
if (csvOutput) {
  const fields = ['original', 'source_url', 'url_template', 'valid', 'source_type', 'approval_status', 'submission_mode', 'enabled', 'audit_flags', 'error']
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [fields.join(','), ...rows.map(row => fields.map(field => quote(Array.isArray(row[field]) ? row[field].join('；') : row[field])).join(','))].join('\n') + '\n'
  await fs.writeFile(csvOutput, csv)
}
console.error(JSON.stringify({ output, csv_output: csvOutput || null, total: result.total, valid: result.valid, invalid: result.invalid, duplicates: result.duplicates }))
