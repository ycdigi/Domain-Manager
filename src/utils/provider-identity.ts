const labels: Record<string, string> = { github: 'GitHub', cloudflare: 'Cloudflare', vhost: '虚拟主机', vps: 'VPS' }
export const providerIdentity = (provider: string, providerName?: string | null, name?: string) => {
  const explicit = providerName?.trim()
  const brandText = explicit && !['虚拟主机', 'VPS'].includes(explicit) ? explicit : name || ''
  const brand = /\bsite[\s-]?ground\b/i.test(brandText) ? 'SiteGround' : /\bhostinger\b/i.test(brandText) ? 'Hostinger' : undefined
  const label = brand || explicit || labels[provider] || provider
  const accountName = name?.trim().toLowerCase() === label.toLowerCase() ? undefined : name
  return { label, accountName, icon: brand?.toLowerCase() || (['github', 'cloudflare'].includes(provider) ? provider : undefined) }
}
