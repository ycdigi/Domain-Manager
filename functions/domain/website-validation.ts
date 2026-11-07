import { dailyClicksRanges, isValidDate } from '../utils/domain-validation'

const choices: Record<string, string[]> = {
    stage: ['待评估', '验证', '增长', '维护', '暂停'],
    lifecycle: ['active', 'stopped'],
    ownership: ['未分类', '自营网站', '企业客户网站'],
    industry: ['计算器', '资讯站', '其他'],
    platform: ['WordPress', 'Astro', 'Next.js', '其他'],
    adsense_connected: ['未知', '已开通', '未开通'],
    gsc_connected: ['未知', '已开通', '未开通'],
    next_action_status: ['待做', '处理中', '已完成']
}
const dates = ['adsense_opened_date', 'seo_last_date', 'clicks_updated_date', 'content_stats_updated_date', 'next_action_due_date']
const counts = ['daily_clicks', 'wp_calculator_count', 'wp_article_count', 'priority_order']

export const validateWebsiteFields = (fields: Record<string, unknown>, current: Record<string, unknown> = {}) => {
    for (const [key, values] of Object.entries(choices)) if (fields[key] !== undefined && !(key === 'industry' && fields[key] === null) && (fields[key] === null || !values.includes(String(fields[key])))) return `${key} 值无效`
    if (fields.name !== undefined && (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.length > 200)) return '网站名称必填且不能超过 200 个字符'
    if (fields.platform_other != null && (typeof fields.platform_other !== 'string' || fields.platform_other.length > 100)) return '其他技术栈名称不能超过 100 个字符'
    if (fields.next_action != null && (typeof fields.next_action !== 'string' || fields.next_action.length > 300)) return '下一步行动不能超过 300 个字符'
    if (fields.potential != null && (typeof fields.potential !== 'string' || fields.potential.length > 2000)) return '潜力说明不能超过 2000 个字符'
    for (const key of counts) if (fields[key] !== undefined && (key === 'priority_order' && fields[key] == null || fields[key] != null && (!Number.isInteger(fields[key]) || Number(fields[key]) < 0))) return `${key} 必须是非负整数`
    if (fields.adsense_account_id != null && (!Number.isInteger(fields.adsense_account_id) || Number(fields.adsense_account_id) <= 0)) return 'AdSense 账号编号无效'
    if (fields.daily_clicks_range != null && !dailyClicksRanges.includes(fields.daily_clicks_range as typeof dailyClicksRanges[number])) return 'daily_clicks_range 无效'
    for (const key of dates) if (fields[key] != null && fields[key] !== '' && !isValidDate(fields[key])) return `${key} 必须是有效的 YYYY-MM-DD 日期`
    const next = { ...current, ...fields }
    if (fields.wp_calculator_count != null || fields.wp_article_count != null) {
        if (next.platform !== 'WordPress') return '只有 WordPress 网站可以填写内容数量'
        if (!isValidDate(fields.content_stats_updated_date)) return '更新 WordPress 内容数量时必须填写统计日期'
    }
    const clicksChanged = fields.daily_clicks !== undefined || fields.daily_clicks_range !== undefined
    if (clicksChanged && (next.daily_clicks != null || next.daily_clicks_range != null) && !isValidDate(fields.clicks_updated_date)) return '更新点击数据时必须填写统计日期'
    if (fields.clicks_updated_date !== undefined && fields.clicks_updated_date != null && !isValidDate(fields.clicks_updated_date)) return 'clicks_updated_date 必须是有效日期'
    return null
}
