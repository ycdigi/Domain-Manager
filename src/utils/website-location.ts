import type { LocationQueryRaw } from 'vue-router'
export const websiteSections = [
  { key: 'basic', label: '基本资料' }, { key: 'content', label: '内容与点击' },
  { key: 'deployment', label: '部署与账号' }, { key: 'domains', label: '域名' },
  { key: 'work', label: '任务与记录' }, { key: 'finance', label: '收入与投入' }, { key: 'monitor', label: '监控' }
] as const
export type WebsiteSection = typeof websiteSections[number]['key']
export const websiteQuery = (id: number, section: WebsiteSection = 'basic', query: LocationQueryRaw = {}): LocationQueryRaw => ({ ...query, site: String(id), section })
