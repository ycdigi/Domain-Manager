import type { Website } from '../api/websites'
import type { Batch } from '../api/batches'
import { providerIdentity } from './provider-identity'

const text = (value: unknown): string => {
  if (value == null || value === '' || value === '未知') return '－'
  return String(value).replace(/\s+/g, ' ').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]#|]/g, '\\$&') || '－'
}
const ranges: Record<string, string> = { under10: '＜10', '10to29': '10–29', '30to49': '30–49', '50to99': '50–99', over100: '≥100' }

export const websitesMarkdown = (sites: Website[], batches: Pick<Batch, 'id' | 'name'>[], date: string): string => {
  const sections = sites.map((site, index) => {
    const domain = site.domains.find(item => item.is_primary) || site.domains[0]
    const batchNames = (site.batch_ids || []).map(id => text(batches.find(batch => batch.id === id)?.name || `批次 #${id}`)).join('；') || '－'
    const accounts = (site.provider_accounts || []).map(account => `${text(providerIdentity(account.provider, account.provider_name, account.name).label)} · ${text(account.name)}`).join('；') || '－'
    const clicks = site.daily_clicks != null ? text(site.daily_clicks) : ranges[site.daily_clicks_range || ''] ? `${ranges[site.daily_clicks_range!]}（档位）` : '－'
    const incomes = site.latest_income?.items.filter(item => item.origin === 'website') || []
    const income = incomes.length ? `${text(site.latest_income!.month)}：${incomes.map(item => `${text(item.source)} ${text(item.currency)} ${text(item.amount)}`).join('；')}` : '－'
    const effort = site.latest_effort ? `${text(site.latest_effort.week_start)} 起，${text(site.latest_effort.hours)} 小时` : '－'
    const hosting = site.hosting ? `${text(providerIdentity(site.hosting.provider, site.hosting.provider_name).label)} · ${text(site.hosting.name)}` : '－'
    return [
      `## ${index + 1}. ${text(site.name)}`,
      '',
      `- 主域名：${text(domain?.domain)}`,
      `- 其他域名：${site.domains.filter(item => item !== domain).map(item => `${text(item.domain)}（${text(item.domain_role)}）`).join('；') || '－'}`,
      `- 注册日期：${text(domain?.registrar_date)}；到期日期：${text(domain?.expiry_date)}`,
      `- 批次：${batchNames}`,
      `- 归属：${text(site.ownership)}；类型：${text(site.industry)}；技术栈：${text(site.platform === '其他' ? site.platform_other || '其他' : site.platform)}`,
      `- 阶段：${text(site.stage)}；经营状态：${site.lifecycle === 'stopped' ? '停止经营' : '经营中'}`,
      `- 内容规模：总页面 ${text(site.page_count)}；计算器 ${text(site.calculator_count)}；文章 ${text(site.article_count)}；更新日期：${text(site.content_stats_updated_date)}`,
      `- 日点击：${clicks}；更新日期：${text(site.clicks_updated_date)}`,
      `- AdSense：${text(site.adsense_connected)}；GSC：${text(site.gsc_connected)}`,
      `- 服务账号归属：${accounts}`,
      `- 实际托管：${hosting}；服务器 IP：${text(site.hosting?.ip_address)}`,
      `- GitHub 仓库：${text(site.repository?.resource_url || site.repository?.name)}；电脑：${text(site.computer_name)}`,
      `- 最近网站收入：${income}`,
      `- 最近每周投入：${effort}`,
      `- 未完成任务：${text(site.open_task_count)}；待复查任务：${text(site.review_count)}`,
      `- 下一步：${text(site.next_action)}；截止日期：${text(site.next_action_due_date)}；状态：${text(site.next_action_status)}`
    ].join('\n')
  })
  return [
    '# 网站分析资料', '', `导出日期：${text(date)}；已选网站：${sites.length} 个。`,
    '口径：总页面数为公开页面数量，不是收录数；日点击为已录入数据，非实时查询。服务账号归属不代表实际托管。收入仅列网站记录，保留月份与原币种，不分摊账号总收入。缺失值为“－”。',
    '', ...sections
  ].join('\n\n')
}
