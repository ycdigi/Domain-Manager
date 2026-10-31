export const checkSiteOnline = async (domain: string) => {
    for (const protocol of ['https', 'http']) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        try {
            const response = await fetch(`${protocol}://${domain}`, {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal,
                headers: { 'User-Agent': 'Domain-Manager-Status-Check/1.0', Accept: '*/*' }
            })
            if (response.status >= 200 && response.status < 500) return true
        } catch {
            // Try the other scheme after connection errors or timeouts.
        } finally {
            clearTimeout(timer)
        }
    }
    return false
}
