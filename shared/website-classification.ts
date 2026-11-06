export const siteOwnerships = ['自营网站', '企业客户网站', '未分类'] as const
export type SiteOwnership = typeof siteOwnerships[number]
export const isSiteOwnership = (value: unknown): value is SiteOwnership =>
    typeof value === 'string' && siteOwnerships.includes(value as SiteOwnership)
