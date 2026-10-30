import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Home from '../views/Home.vue'
import { useAuth } from '../utils/auth'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            redirect: '/login'
        },
        {
            path: '/login',
            name: 'Login',
            component: Login
        },
        {
            path: '/home',
            name: 'Home',
            component: Home,
            meta: { requiresAuth: true }
        }
    ]
})

// 路由守卫
router.beforeEach(async (to, _from, next) => {
    const auth = useAuth()
    const token = auth.getAuthToken()

    if (to.meta.requiresAuth && !token) {
        next('/login')
    } else if (to.name === 'Login' && token) {
        next({ name: 'Home' })
    } else {
        next()
    }
})

export default router
