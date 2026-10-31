const encoder = new TextEncoder()

const toBase64 = (bytes: Uint8Array) => {
    let binary = ''
    bytes.forEach(byte => { binary += String.fromCharCode(byte) })
    return btoa(binary)
}

const fromBase64 = (value: string) => {
    const binary = atob(value)
    return Uint8Array.from(binary, char => char.charCodeAt(0))
}

const getKey = async (secret?: string) => {
    if (!secret || secret.length < 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY 至少需要 32 个字符')
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export const encryptCredential = async (value: string, secret?: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await getKey(secret)
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
    return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`
}

export const decryptCredential = async (value: string, secret?: string) => {
    const [ivText, cipherText] = value.split('.')
    if (!ivText || !cipherText) throw new Error('凭据格式无效')
    const key = await getKey(secret)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivText) }, key, fromBase64(cipherText))
    return new TextDecoder().decode(decrypted)
}
