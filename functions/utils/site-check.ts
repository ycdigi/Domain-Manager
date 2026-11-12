import { checkWebsite } from '../../shared/site-monitor'

export const checkSiteOnline = async (domain: string) => {
    const result = await checkWebsite({ domain, required_text: [], forbidden_text: [], allowed_redirect_hosts: [], baseline_title: null })
    return result.available === true
}
