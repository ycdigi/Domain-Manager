import type { Env } from '../../types'
import { checkApiToken } from '../../utils/auth'
import { todayShanghaiDate } from '../../utils/domain-validation'
import { checkSiteOnline } from '../../utils/site-check'

interface AlertConfig {
    tg_token: string
    tg_userid: string
    days: number
}

interface Domain {
    domain: string
    expiry_date: string
    tgsend: number
    st_tgsend: number
    status: string
    last_expiry_alert_date: string | null
    last_offline_alert_at: string | null
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const authError = await checkApiToken(context)
        if (authError) return authError

        console.log('开始执行域名检查...')
        const { results: configResults } = await context.env.DB.prepare(
            'SELECT * FROM alertcfg LIMIT 1'
        ).all<AlertConfig>()

        if (!configResults.length) {
            console.log('未找到告警配置')
            return Response.json({
                status: 404,
                message: '未找到告警配置',
                data: null
            }, { status: 404 })
        }

        const config = configResults[0]
        console.log('获取到告警配置:', {
            days: config.days,
            has_token: !!config.tg_token,
            has_userid: !!config.tg_userid
        })

        // 获取所有域名
        const { results: domains } = await context.env.DB.prepare(
            'SELECT domain, expiry_date, tgsend, st_tgsend, status, last_expiry_alert_date, last_offline_alert_at FROM domains WHERE tgsend = 1 or st_tgsend = 1'
        ).all<Domain>()

        console.log(`找到 ${domains.length} 个启用通知的域名`)
        const notifiedDomains: Array<{ domain: string; remainingDays: number; expiry_date: string }> = []
        const today = todayShanghaiDate()

        const checkDomain = async (domain: Domain) => {
            const remainingDays = calculateRemainingDays(domain.expiry_date, today)
            const isOnline = await checkSiteOnline(domain.domain)

            const newStatus = isOnline ? '在线' : '离线'
            let expiryAlertSent = false
            let offlineAlertSent = false

            // 如果状态变为离线且启用了通知，发送 Telegram 消息
            if (newStatus === '离线' && domain.st_tgsend === 1 && (domain.status !== '离线' || !domain.last_offline_alert_at)) {
                const message = `*🔔 Domains-Support 通知*\n\n` +
                    `⚠️ *域名服务离线告警*\n\n` +
                    `🌐 域名：\`${domain.domain}\`\n` +
                    `📊 状态：离线\n` +
                    `⏰ 时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n` +
                    `🔍 请检查网站服务状态！`

                try {
                    await sendTelegramMessage(config.tg_token, config.tg_userid, message)
                    offlineAlertSent = true
                    console.log(`成功发送离线通知：${domain.domain}`)
                } catch (error) {
                    console.error(`发送离线通知失败：${domain.domain}`)
                }
            }

            // 检查域名是否即将过期
            if (remainingDays <= config.days && domain.tgsend === 1 && domain.last_expiry_alert_date !== today) {
                console.log(`域名 ${domain.domain} 需要发送过期通知：剩余天数(${remainingDays}) <= 阈值(${config.days})`)
                const message = `*🔔 Domains-Support通知*\n\n` +
                    `🌐 域名：\`${domain.domain}\`\n` +
                    `📅 过期时间：\`${domain.expiry_date}\`\n` +
                    `⏳ 剩余天数：\`${remainingDays}天\`\n\n` +
                    `⚠️ 剩余天数告警，请尽快进行续约！`

                try {
                    console.log('准备发送过期通知...')
                    await sendTelegramMessage(config.tg_token, config.tg_userid, message)
                    expiryAlertSent = true
                    console.log(`成功发送过期通知：${domain.domain}`)
                    notifiedDomains.push({
                        domain: domain.domain,
                        remainingDays,
                        expiry_date: domain.expiry_date
                    })
                } catch (error) {
                    console.error(`发送过期通知失败：${domain.domain}`)
                }
            }

            return context.env.DB.prepare(`
                UPDATE domains SET status = ?, last_status_check_at = ?,
                    last_expiry_alert_date = CASE WHEN ? = 1 THEN ? ELSE last_expiry_alert_date END,
                    last_offline_alert_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_offline_alert_at END
                WHERE domain = ? AND (status IS NOT ? OR date(last_status_check_at) IS NOT ? OR ? = 1 OR ? = 1)
            `).bind(newStatus, today, Number(expiryAlertSent), today, Number(offlineAlertSent), domain.domain, newStatus, today, Number(expiryAlertSent), Number(offlineAlertSent))
        }

        const statusStatements: D1PreparedStatement[] = []
        for (let index = 0; index < domains.length; index += 4) {
            statusStatements.push(...await Promise.all(domains.slice(index, index + 4).map(checkDomain)))
        }
        for (let index = 0; index < statusStatements.length; index += 100) {
            await context.env.DB.batch(statusStatements.slice(index, index + 100))
        }

        return Response.json({
            status: 200,
            message: '检查完成',
            data: {
                total_domains: domains.length,
                notified_domains: notifiedDomains
            }
        })
    } catch (error) {
        console.error('检查执行失败:', error)
        return Response.json({
            status: 500,
            message: '检查执行失败: ' + (error as Error).message,
            data: null
        }, { status: 500 })
    }
}

// 添加对 GET 方法的支持
export const onRequestGet: PagesFunction<Env> = onRequestPost

function calculateRemainingDays(expiryDate: string, todayDate: string): number {
    const expiry = Date.parse(`${expiryDate}T00:00:00Z`)
    const today = Date.parse(`${todayDate}T00:00:00Z`)
    const diffDays = Math.floor((expiry - today) / 86400000)
    return Math.max(0, diffDays)
}

async function sendTelegramMessage(token: string, chatId: string, message: string): Promise<void> {
    if (!token || !chatId) {
        throw new Error('Telegram token 或 chat ID 未配置')
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
        }),
    })

    if (!response.ok) {
        console.error('Telegram API request failed:', response.status)
        throw new Error(`Telegram API request failed: ${response.status}`)
    }

}
