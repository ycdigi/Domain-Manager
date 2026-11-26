export const githubPushUrl = (value: string) => {
    const url = value.trim().replace(/\/$/, '')
    return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(url)
        ? url.endsWith('.git') ? url : `${url}.git` : null
}

export const httpLoginUrl = (value: string) => {
    try {
        const url = new URL(value)
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
    } catch { return null }
}

type MaintenanceSite = {
    platform: string
    github_push_url?: string | null
    wp_login_url?: string | null
    repository?: { id: number } | null
    provider_accounts?: Array<{ provider: string }>
    domains: Array<{ domain: string; is_primary?: number }>
}
export const websiteMaintenance = (site: MaintenanceSite) => {
    if (site.github_push_url || site.repository || site.provider_accounts?.some(account => account.provider === 'github'))
        return { kind: 'github', label: '复制 GitHub 推送资料' } as const
    if (site.platform === 'WordPress') {
        const domain = site.domains.find(item => item.is_primary)?.domain
        const url = site.wp_login_url ? httpLoginUrl(site.wp_login_url) : domain ? httpLoginUrl(`https://${domain}/safelogin`) : null
        if (url) return { kind: 'login', label: '登录后台', url } as const
    }
    return { kind: 'configure', label: '配置维护入口' } as const
}
