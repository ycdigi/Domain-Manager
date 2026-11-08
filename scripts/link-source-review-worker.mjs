import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

const DEFAULT_STATE_FILE = path.resolve(process.cwd(), '.link-source-review-state.json')
const DEFAULT_MINUTES = 1
const DEFAULT_STAY_MIN_MS = 10_000
const DEFAULT_STAY_MAX_MS = 15_000

export const normalizeTargetUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return null
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch { return null }
}

export const buildVisitUrl = (source, targetUrl) => {
  const target = normalizeTargetUrl(targetUrl)
  if (!target) return null
  const template = typeof source.url_template === 'string' && source.url_template.trim() ? source.url_template.trim() : null
  const raw = template ? template.replace(/\{\{target_url\}\}/g, encodeURIComponent(target)) : source.source_url
  return normalizeTargetUrl(raw)
}

export const classifyResponse = ({ status, finalUrl, requestedUrl, error } = {}) => {
  if (error) {
    const message = String(error).toLowerCase()
    return { check_status: message.includes('timeout') ? '超时' : '错误', http_status: null, error_message: String(error) }
  }
  if (status === 404) return { check_status: '404', http_status: 404, error_message: null }
  if (status === 401 || status === 403 || (status >= 400 && status < 500)) return { check_status: '受阻', http_status: status, error_message: null }
  if (status >= 500) return { check_status: '错误', http_status: status, error_message: null }
  if (status >= 300 && status < 400) return { check_status: '重定向', http_status: status, error_message: null }
  if (finalUrl && requestedUrl && finalUrl !== requestedUrl) return { check_status: '重定向', http_status: status || null, error_message: null }
  if (status >= 200 && status < 300) return { check_status: '可访问', http_status: status, error_message: null }
  return { check_status: '错误', http_status: status || null, error_message: '没有得到有效的 HTTP 响应' }
}

export const mergeSourceResult = (current, next) => {
  const rank = { 可访问: 5, 重定向: 4, 受阻: 3, 404: 2, 超时: 1, 错误: 0, 需要人工验证: 0, 未检查: -1 }
  if (!current) return { ...next, attempt_count: 1, accessible_count: ['可访问', '重定向'].includes(next.check_status) ? 1 : 0 }
  const nextIsAccessible = ['可访问', '重定向'].includes(next.check_status)
  const currentStatus = rank[current.check_status] >= rank[next.check_status] ? current.check_status : next.check_status
  return {
    ...current,
    check_status: currentStatus,
    http_status: rank[current.check_status] >= rank[next.check_status] ? current.http_status : next.http_status,
    checked_url: next.checked_url,
    checked_at: next.checked_at,
    error_message: currentStatus === '可访问' || currentStatus === '重定向' ? null : next.error_message || current.error_message,
    attempt_count: Number(current.attempt_count || 0) + 1,
    accessible_count: Number(current.accessible_count || 0) + (nextIsAccessible ? 1 : 0)
  }
}

export const buildQueue = (websites, sources, completed = {}) => {
  const queue = []
  for (const website of websites) {
    if (website.lifecycle === 'stopped') continue
    const primary = (website.domains || []).find(domain => Number(domain.is_primary) === 1) || (website.domains || [])[0]
    if (!primary?.domain) continue
    for (const source of sources) {
      const key = `${website.id}:${source.id}`
      if (!completed[key]) queue.push({ key, website_id: Number(website.id), source_id: Number(source.id), target_url: `https://${primary.domain}`, source_url: buildVisitUrl(source, primary.domain) })
    }
  }
  return queue.filter(item => item.source_url)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const json = async response => {
  const body = await response.json()
  if (!response.ok || body.status >= 400) throw new Error(body.message || `请求失败：${response.status}`)
  return body.data
}
const apiRequest = async (baseUrl, token, endpoint, options = {}) => {
  const response = await fetch(new URL(endpoint, baseUrl), { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
  return json(response)
}

const loadState = async file => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return { completed: {}, sourceResults: {} } }
}
const saveState = async (file, state) => {
  const temp = `${file}.tmp`
  await fs.writeFile(temp, JSON.stringify(state, null, 2))
  await fs.rename(temp, file)
}
const numberEnv = (name, fallback) => Number.isFinite(Number(process.env[name])) ? Number(process.env[name]) : fallback

export const run = async ({ baseUrl, token, stateFile = DEFAULT_STATE_FILE, intervalMinutes = DEFAULT_MINUTES, stayMinMs = DEFAULT_STAY_MIN_MS, stayMaxMs = DEFAULT_STAY_MAX_MS, executablePath, wsEndpoint } = {}) => {
  if (!baseUrl || !token) throw new Error('需要 DOMAIN_MANAGER_URL 和 DOMAIN_MANAGER_API_TOKEN')
  const [websites, sources] = await Promise.all([
    apiRequest(baseUrl, token, '/api/websites?lifecycle=active'),
    apiRequest(baseUrl, token, '/api/link-sources')
  ])
  const state = await loadState(stateFile)
  const queue = buildQueue(websites, sources, state.completed)
  const total = websites.filter(site => site.lifecycle !== 'stopped' && ((site.domains || []).some(domain => Number(domain.is_primary) === 1) || (site.domains || []).length)).length * sources.length
  const startedAt = new Date().toISOString()
  await apiRequest(baseUrl, token, '/api/link-sources/review', { method: 'POST', body: JSON.stringify({ run: { planned_count: total, completed_count: total - queue.length, failed_count: 0, status: '运行中', started_at: startedAt }, results: [] }) })
  if (!queue.length) {
    await apiRequest(baseUrl, token, '/api/link-sources/review', { method: 'POST', body: JSON.stringify({ run: { planned_count: total, completed_count: total, failed_count: 0, status: '已完成', started_at: startedAt, completed_at: new Date().toISOString() }, results: Object.values(state.sourceResults) }) })
    return { planned: total, completed: total, skipped: 0, failed: 0 }
  }
  const browser = wsEndpoint
    ? await chromium.connectOverCDP(wsEndpoint)
    : await chromium.launch({ headless: false, executablePath: executablePath || process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
  const context = wsEndpoint ? await browser.newContext() : (browser.contexts()[0] || await browser.newContext())
  const page = context.pages()[0] || await context.newPage()
  let failed = 0
  try {
    for (const item of queue) {
      const source = sources.find(row => Number(row.id) === item.source_id)
      const result = { source_id: item.source_id, checked_url: item.source_url, checked_at: new Date().toISOString() }
      try {
        const response = await page.goto(item.source_url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        Object.assign(result, classifyResponse({ status: response?.status() || 0, finalUrl: page.url(), requestedUrl: item.source_url }))
        await sleep(stayMinMs + Math.floor(Math.random() * Math.max(1, stayMaxMs - stayMinMs + 1)))
      } catch (error) {
        failed += 1
        Object.assign(result, classifyResponse({ error: error instanceof Error ? error.message : String(error), requestedUrl: item.source_url }))
      }
      state.completed[item.key] = { completed_at: new Date().toISOString(), check_status: result.check_status, http_status: result.http_status }
      state.sourceResults[item.source_id] = mergeSourceResult(state.sourceResults[item.source_id], { ...result, source_id: item.source_id, checked_url: source ? item.source_url : result.checked_url })
      await saveState(stateFile, state)
      if (queue.indexOf(item) < queue.length - 1) await sleep(Math.max(0, intervalMinutes * 60_000 - (stayMinMs + 1_000)))
    }
  } finally {
    if (wsEndpoint) await context.close()
    else await browser.close()
  }
  await apiRequest(baseUrl, token, '/api/link-sources/review', { method: 'POST', body: JSON.stringify({ run: { planned_count: total, completed_count: total - failed, failed_count: failed, status: failed ? '部分完成' : '已完成', started_at: startedAt, completed_at: new Date().toISOString() }, results: Object.values(state.sourceResults) }) })
  return { planned: total, completed: total - failed, skipped: 0, failed }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run({
    baseUrl: process.env.DOMAIN_MANAGER_URL,
    token: process.env.DOMAIN_MANAGER_API_TOKEN,
    stateFile: process.env.LINK_REVIEW_STATE_FILE || DEFAULT_STATE_FILE,
    intervalMinutes: numberEnv('LINK_REVIEW_INTERVAL_MINUTES', DEFAULT_MINUTES),
    stayMinMs: numberEnv('LINK_REVIEW_STAY_MIN_MS', DEFAULT_STAY_MIN_MS),
    stayMaxMs: numberEnv('LINK_REVIEW_STAY_MAX_MS', DEFAULT_STAY_MAX_MS),
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    wsEndpoint: process.env.BROWSER_WS_ENDPOINT
  }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
