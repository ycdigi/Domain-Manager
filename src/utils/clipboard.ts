export class ClipboardError extends Error {
    constructor(message = '复制失败') {
        super(message)
        this.name = 'ClipboardError'
    }
}

export const copyText = async (text: string): Promise<void> => {
    if (!text) throw new ClipboardError('没有可复制的内容')

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text)
            return
        } catch {
            // Continue with the DOM fallback for insecure or restricted contexts.
        }
    }

    if (typeof document === 'undefined' || !document.body) throw new ClipboardError()
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    let copied = false
    try {
        textarea.focus()
        textarea.select()
        textarea.setSelectionRange(0, text.length)
        copied = document.execCommand('copy')
    } finally {
        textarea.remove()
        previousFocus?.focus({ preventScroll: true })
    }
    if (!copied) throw new ClipboardError()
}
