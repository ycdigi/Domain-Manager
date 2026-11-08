import http from 'node:http'
import process from 'node:process'
import path from 'node:path'
import { run } from './link-source-review-worker.mjs'

const port = Number(process.env.LINK_REVIEW_AGENT_PORT || 4317)
const stateFile = process.env.LINK_REVIEW_STATE_FILE || path.resolve(process.env.HOME || process.cwd(), '.domain-manager/link-source-review-state.json')
let active = null
let stopRequested = false

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
const reply = (response, status, data) => response.writeHead(status, headers).end(JSON.stringify(data))
const body = request => new Promise((resolve, reject) => { let raw = ''; request.on('data', chunk => { raw += chunk }); request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch (error) { reject(error) } }); request.on('error', reject) })

const start = async (payload) => {
  if (active) throw new Error('轮询已经在运行')
  if (typeof payload?.base_url !== 'string' || typeof payload?.token !== 'string' || !payload.base_url || !payload.token) throw new Error('启动信息无效')
  stopRequested = false
  active = { started_at: new Date().toISOString(), status: '运行中' }
  try {
    const result = await run({ baseUrl: payload.base_url, token: payload.token, stateFile, shouldStop: () => stopRequested })
    active = { ...active, ...result, status: result.stopped ? '已停止' : '已完成', completed_at: new Date().toISOString() }
  } catch (error) {
    active = { ...active, status: '失败', error: error instanceof Error ? error.message : String(error), completed_at: new Date().toISOString() }
  }
  setTimeout(() => { active = null }, 60_000)
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return reply(response, 204, null)
  try {
    if (request.method === 'GET' && request.url === '/status') return reply(response, 200, { running: Boolean(active && active.status === '运行中'), active })
    if (request.method === 'POST' && request.url === '/start') {
      if (active) return reply(response, 409, { message: '轮询已经在运行', active })
      void start(await body(request))
      return reply(response, 202, { message: '轮询已启动', running: true })
    }
    if (request.method === 'POST' && request.url === '/stop') {
      stopRequested = true
      return reply(response, 202, { message: '已发送停止指令' })
    }
    return reply(response, 404, { message: 'Not Found' })
  } catch (error) { return reply(response, 400, { message: error instanceof Error ? error.message : String(error) }) }
})

server.listen(port, '127.0.0.1', () => console.log(`link review agent listening on 127.0.0.1:${port}`))
