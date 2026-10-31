#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (token.startsWith('--')) args.set(token.slice(2), process.argv[i + 1] || '')
}
const input = args.get('input')
const output = args.get('output') || 'domains-enriched.json'
const sqlOutput = args.get('sql-output')
const concurrency = Math.max(1, Math.min(16, Number(args.get('concurrency') || 8)))
if (!input) {
  console.error('用法: node scripts/enrich-domains.mjs --input domains.csv|domains.json --output domains-enriched.json --sql-output domains-enriched.sql')
  process.exit(1)
}

const readDomains = async file => {
  const text = await fs.readFile(file, 'utf8')
  if (path.extname(file).toLowerCase() === '.json') {
    const parsed = JSON.parse(text)
    const rows = Array.isArray(parsed) ? parsed : parsed.domains || []
    return rows.map(row => typeof row === 'string' ? row : row.domain).filter(Boolean).map(normalizeDomain)
  }
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  const header = rows.shift() || []
  const domainIndex = header.findIndex(value => value.trim().toLowerCase() === 'domain')
  if (domainIndex < 0) throw new Error('CSV 必须包含 domain 列')
  return rows.map(row => row[domainIndex]).filter(Boolean).map(normalizeDomain)
}

function normalizeDomain(value) { return String(value).trim().toLowerCase().replace(/\.$/, '') }
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1]
    if (char === '"') {
      if (quoted && next === '"') { field += '"'; i += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(field); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(field); field = ''
      if (row.some(value => value.trim())) rows.push(row)
      row = []
    } else field += char
  }
  if (field || row.length) { row.push(field); if (row.some(value => value.trim())) rows.push(row) }
  return rows
}

const industryRules = [
  ['电气/工程', ['electr', 'electrotech', 'voltage', 'resistor', 'ohm', 'watt', 'amp', 'circuit', 'lighting', 'wire', 'cable', 'engineering', 'solar', 'battery', 'transistor', 'vde', 'nec']],
  ['工业/制造', ['welding', 'cnc', 'cement', 'manufactur', 'machin', 'industrial', 'steel', 'laser', 'factory', 'packaging']],
  ['酒店/旅游', ['hotel', 'travel', 'tourism', 'booking', 'hostel', 'resort']],
  ['家居/装修', ['home', 'house', 'kitchen', 'bathroom', 'interior', 'furniture', 'wall', 'roof', 'lock']],
  ['软件/工具', ['software', 'app', 'toolkit', 'api', 'developer', 'code', 'convert', 'generator']],
  ['健康/医疗', ['health', 'medical', 'clinic', 'doctor', 'hospital', 'fitness', 'calorie', 'diet']],
  ['教育', ['school', 'course', 'learn', 'education', 'university', 'study']]
]
const cleanText = value => String(value || '').replace(/\s+/g, ' ').replace(/[|•·]+/g, ' ').trim()
const decodeEntities = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
const extract = (html, pattern) => decodeEntities(cleanText(html.match(pattern)?.[1] || ''))
const infer = (domain, html, responseHeaders) => {
  const title = extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const ogSite = extract(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i) || extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:site_name["']/i)
  const h1 = extract(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '')
  const description = extract(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  const text = `${title} ${ogSite} ${h1} ${description} ${Object.entries(responseHeaders).join(' ')}`.toLowerCase()
  const scores = industryRules.map(([industry, words]) => [industry, words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0)]).sort((a, b) => b[1] - a[1])
  const top = scores[0]
  const industry = top?.[1] >= 2 ? top[0] : null
  const candidate = ogSite || title || h1
  const normalizedCandidate = cleanText(candidate).toLowerCase().replace(/[^a-z0-9]+/g, '')
  const normalizedDomain = domain.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const siteName = candidate && normalizedCandidate !== normalizedDomain && !/^(home|homepage|welcome|just another wordpress site|404|error|page not found)$/i.test(candidate) ? candidate.slice(0, 200) : null
  return { site_name: siteName || null, industry, evidence: { title: title || null, og_site_name: ogSite || null, h1: h1 || null, description: description || null, industry_score: top?.[1] || 0 }, stack: detectStack(html.toLowerCase()), response_status: null }
}
const detectStack = text => text.includes('wp-content') || text.includes('wp-includes') || text.includes('wordpress') ? 'WordPress' : text.includes('__next_data__') || text.includes('/_next/') || text.includes('next.js') ? 'Next.js' : text.includes('/_astro/') || text.includes('astro-island') ? 'Astro' : null
const crawl = async domain => {
  let lastError = null
  for (const scheme of ['https', 'http']) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${scheme}://${domain}/`, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Domain-Manager enrichment audit/1.0' } })
      const html = Buffer.from(await response.arrayBuffer()).subarray(0, 500000).toString('utf8')
      clearTimeout(timer)
      const result = infer(domain, html, Object.fromEntries(response.headers.entries()))
      return { domain, checked: true, final_url: response.url, ...result, response_status: response.status }
    } catch (error) { clearTimeout(timer); lastError = error instanceof Error ? error.message : String(error) }
  }
  return { domain, checked: false, final_url: null, site_name: null, industry: null, stack: null, evidence: {}, response_status: null, error: lastError }
}
const sqlQuote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`
const domains = [...new Set(await readDomains(input))]
const results = []; let cursor = 0
const workers = Array.from({ length: concurrency }, async () => { while (cursor < domains.length) { const index = cursor++; results[index] = await crawl(domains[index]); process.stderr.write(`\rchecked ${results.filter(Boolean).length}/${domains.length}`) } })
await Promise.all(workers)
await fs.writeFile(output, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2))
if (sqlOutput) {
  const statements = results.filter(row => row.checked && (row.site_name || row.industry || row.stack)).map(row => {
    const platformUpdate = row.stack ? `platform = CASE WHEN platform IS NULL OR platform = '其他' THEN ${sqlQuote(row.stack)} ELSE platform END` : 'platform = platform'
    const platformOtherUpdate = row.stack ? `platform_other = CASE WHEN platform IS NULL OR platform = '其他' THEN NULL ELSE platform_other END` : 'platform_other = platform_other'
    return `UPDATE domains SET site_name = COALESCE(NULLIF(site_name, ''), ${sqlQuote(row.site_name)}), industry = COALESCE(NULLIF(industry, ''), ${sqlQuote(row.industry)}), ${platformUpdate}, ${platformOtherUpdate} WHERE lower(rtrim(domain, '.')) = ${sqlQuote(row.domain)};`
  })
  await fs.writeFile(sqlOutput, `${statements.join('\n')}\n`)
}
const summary = results.reduce((acc, row) => { acc[row.industry || '未识别'] = (acc[row.industry || '未识别'] || 0) + 1; return acc }, {})
console.error(`\n${JSON.stringify({ total: results.length, reachable: results.filter(row => row.checked).length, named: results.filter(row => row.site_name).length, classified: results.filter(row => row.industry).length, summary, output, sqlOutput: sqlOutput || null }, null, 2)}`)
