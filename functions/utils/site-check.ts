import { checkWebsite } from '../../shared/site-monitor'

export const checkSiteOnline = async (domain: string) => {
    const result = await checkWebsite({ domain, allowed_redirect_hosts: [] })
    return result.available === true
}
