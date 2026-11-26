export const siteOwnerships = ['自营网站', '企业客户网站', '未分类'] as const
export type SiteOwnership = typeof siteOwnerships[number]
export const isSiteOwnership = (value: unknown): value is SiteOwnership =>
    typeof value === 'string' && siteOwnerships.includes(value as SiteOwnership)

export const websiteIndustries = ['计算器', '资讯站', '其他'] as const
export type WebsiteIndustry = typeof websiteIndustries[number]

export const websiteStages = ['待评估', '验证', '增长', '平稳', '下降', '维护', '暂停'] as const
export type WebsiteStage = typeof websiteStages[number]
