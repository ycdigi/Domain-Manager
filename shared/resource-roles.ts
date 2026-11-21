export const resourceRoles = ['托管', '代码仓库', 'DNS/CDN', '其他'] as const
export const resourceSupportsRole = (provider: string, role: string) => resourceRoles.includes(role as typeof resourceRoles[number]) && (role === '代码仓库' ? provider === 'github' : role === '托管' ? provider !== 'github' : true)
