export const siteOwnerships = ['自营网站', '企业客户网站', '未分类'] as const
export type SiteOwnership = typeof siteOwnerships[number]
export const isSiteOwnership = (value: unknown): value is SiteOwnership =>
    typeof value === 'string' && siteOwnerships.includes(value as SiteOwnership)

export const websiteIndustries = ['计算器', '资讯站', '其他'] as const
export type WebsiteIndustry = typeof websiteIndustries[number]
export const isWebsiteIndustry = (value: unknown): value is WebsiteIndustry =>
    typeof value === 'string' && websiteIndustries.includes(value as WebsiteIndustry)
export const normalizeWebsiteIndustry = (value: unknown): WebsiteIndustry | null => {
    if (value == null || value === '') return null
    return isWebsiteIndustry(value) ? value : '其他'
}
