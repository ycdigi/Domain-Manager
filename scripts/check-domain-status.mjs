const baseUrl = String(process.env.DOMAIN_MANAGER_URL || '').replace(/\/$/, '')
const token = process.env.DOMAIN_MANAGER_API_TOKEN
if (!baseUrl || !token) throw new Error('DOMAIN_MANAGER_URL 和 DOMAIN_MANAGER_API_TOKEN 必须配置')

const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
const targetsResponse = await fetch(`${baseUrl}/api/monitor/status`, { headers })
if (!targetsResponse.ok) throw new Error(`获取检查目标失败：HTTP ${targetsResponse.status}`)
const targets = (await targetsResponse.json()).data || []

const check = async target => {
  for (const protocol of ['https', 'http']) {
    try {
      const response = await fetch(`${protocol}://${target.domain}`, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Domain-Manager-GitHub-Monitor/1.0', Accept: '*/*' } })
      if (response.status >= 200 && response.status < 500) return { id: target.id, domain: target.domain, status: '在线' }
    } catch {}
  }
  return { id: target.id, domain: target.domain, status: '离线' }
}

const results = []
for (let index = 0; index < targets.length; index += 10) results.push(...await Promise.all(targets.slice(index, index + 10).map(check)))
const updateResponse = await fetch(`${baseUrl}/api/monitor/status`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ checks: results }) })
if (!updateResponse.ok) throw new Error(`写入检查结果失败：HTTP ${updateResponse.status}`)
const summary = results.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {})
console.log(JSON.stringify({ total: results.length, ...summary }))
