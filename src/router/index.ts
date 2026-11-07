import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import { clearWorkspaceCache } from '../utils/workspaceCache'
let loggingOut = false
import { useAuth } from '../utils/auth'

const router = createRouter({
    history: createWebHistory(),
    scrollBehavior(to, from, saved) { return saved || (to.path === from.path ? undefined : { top: 0 }) },
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
            path: '/',
            component: WorkspaceLayout,
            meta: { requiresAuth: true },
            children: [
                { path: 'home', name: 'Home', component: () => import('../views/Home.vue') },
                { path: 'domains', name: 'Domains', component: () => import('../views/Domains.vue') },
                { path: 'resources', name: 'Resources', component: () => import('../views/Resources.vue') },
                { path: 'adsense', name: 'Adsense', component: () => import('../views/Adsense.vue') },
                { path: 'data', name: 'Data', component: () => import('../views/DataManagement.vue') }
            ]
        }
    ]
})

// 路由守卫
router.beforeEach(async (to, _from, next) => {
    const auth = useAuth()
    const token = auth.getAuthToken()

    if (to.meta.requiresAuth && !token) {
        next('/login')
    } else if (to.name === 'Login' && token && !loggingOut) {
        next({ name: 'Home' })
    } else {
        next()
    }
})

router.afterEach(to => { if (to.name === 'Login' && !useAuth().getAuthToken()) clearWorkspaceCache() })

export const logoutWorkspace = async () => {
    loggingOut = true
    try {
        const failure = await router.push({ name: 'Login' })
        if (!failure) { useAuth().clearAuth(); clearWorkspaceCache() }
    } finally { loggingOut = false }
}
export default router
