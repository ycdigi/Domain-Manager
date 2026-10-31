import { Env } from '../../types'
import { issueSessionToken } from '../../utils/auth'

interface LoginRequest {
    username: string
    password: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body = await context.request.json() as Partial<LoginRequest>
        const username = typeof body.username === 'string' ? body.username : ''
        const password = typeof body.password === 'string' ? body.password : ''
        const expectedUsername = context.env.USER
        const expectedPassword = context.env.PASS

        if (!expectedUsername || !expectedPassword) {
            console.error('环境变量未设置:', {
                hasUsername: !!expectedUsername,
                hasPassword: !!expectedPassword
            })
            return Response.json({
                status: 500,
                message: '系统配置错误：未设置用户名或密码',
                data: null
            }, { status: 500 })
        }

        if (username === expectedUsername && password === expectedPassword) {
            const token = await issueSessionToken(username, expectedPassword)

            return Response.json({
                status: 200,
                message: '登录成功',
                data: { token }
            })
        } else {
            return Response.json({
                status: 401,
                message: '用户名或密码错误',
                data: null
            }, { status: 401 })
        }
    } catch (error) {
        console.error('登录错误:', error)
        return Response.json({
            status: 500,
            message: error instanceof Error ? error.message : '登录失败',
            data: null
        }, { status: 500 })
    }
}
