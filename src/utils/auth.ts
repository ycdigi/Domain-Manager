import { ref } from 'vue'

interface AuthToken {
    token: string
}

export const useAuth = () => {
    const isAuthenticated = ref(false)

    // 登录凭据保留至主动登出或清除本站浏览器数据。
    const setAuthToken = (token: string) => {
        const authData: AuthToken = {
            token
        }

        // 使用原有 Base64 格式保存，兼容已登录的浏览器。
        const encrypted = btoa(JSON.stringify(authData))
        localStorage.setItem('auth_token', encrypted)
        isAuthenticated.value = true
    }

    const getAuthToken = (): AuthToken | null => {
        const encrypted = localStorage.getItem('auth_token')
        if (!encrypted) return null

        try {
            const decrypted = JSON.parse(atob(encrypted))
            if (typeof decrypted?.token !== 'string' || !decrypted.token) {
                localStorage.removeItem('auth_token')
                isAuthenticated.value = false
                return null
            }
            isAuthenticated.value = true
            return { token: decrypted.token }
        } catch {
            localStorage.removeItem('auth_token')
            isAuthenticated.value = false
            return null
        }
    }

    const clearAuth = () => {
        localStorage.removeItem('auth_token')
        isAuthenticated.value = false
    }

    return {
        isAuthenticated,
        setAuthToken,
        getAuthToken,
        clearAuth
    }
} 