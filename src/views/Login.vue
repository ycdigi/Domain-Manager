<template>
    <div class="login-container">
        <main class="workspace login-workspace">
            <section class="login-panel" aria-labelledby="login-title">
                <div class="login-heading">
                    <h1 id="login-title">登录</h1>
                    <p>域名管理系统</p>
                </div>
                <el-form ref="formRef" :model="loginForm" :rules="rules" @submit.prevent="handleLogin" label-position="top" :aria-busy="submitting">
                    <el-form-item label="用户名" prop="username">
                        <el-input v-model="loginForm.username" name="username" autocomplete="username" placeholder="请输入用户名" :prefix-icon="User" clearable />
                    </el-form-item>
                    <el-form-item label="密码" prop="password">
                        <el-input v-model="loginForm.password" name="password" autocomplete="current-password" type="password" placeholder="请输入密码" :prefix-icon="Lock" show-password />
                    </el-form-item>
                    <p v-if="loginError" class="login-error" role="alert">{{ loginError }}</p>
                    <el-button class="login-submit" type="primary" native-type="submit" :loading="submitting" :disabled="submitting">登录</el-button>
                </el-form>
            </section>
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuth } from '../utils/auth'
import { User, Lock } from '@element-plus/icons-vue'

interface ApiResponse<T = any> {
    status: number
    message: string
    data: T
}

interface LoginResponse {
    token: string
}

const auth = useAuth()
const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const loginError = ref('')
const loginForm = ref({
    username: '',
    password: ''
})
const rules: FormRules = {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const handleLogin = async () => {
    if (submitting.value || !formRef.value) return
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid || submitting.value) return

    submitting.value = true
    loginError.value = ''
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: loginForm.value.username,
                password: loginForm.value.password
            })
        })

        const result = await response.json() as ApiResponse<LoginResponse>

        if (result.status === 200 && result.data?.token) {
            auth.setAuthToken(result.data.token)
            await router.push({ name: 'Home' })
        } else {
            loginError.value = result.message || '用户名或密码错误'
        }
    } catch (error) {
        console.error('Login error:', error)
        loginError.value = '登录失败，请重试。'
    } finally {
        submitting.value = false
    }
}
</script>

<style scoped src="../styles/login/login.css"></style>
