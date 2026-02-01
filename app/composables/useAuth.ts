// app/composables/useAuth.ts
import { computed } from 'vue'
import { authApi } from '~/api/authApi'

type AuthUser = {
    userId: string
    email: string
}

export function useAuth() {
    const token = useCookie<string | null>('auth_token', {
        sameSite: 'lax',
    })

    const user = useState<AuthUser | null>('auth_user', () => null)
    const isAuthed = computed(() => !!token.value)

    async function login(email: string, password: string) {
        const res = await authApi.login({ email, password })

        token.value = res.token
        user.value = {
            userId: res.userId,
            email: res.email,
        }

        await navigateTo('/dashboard')
    }

    async function register(email: string, password: string, firstName: string, lastName: string) {
        const res = await authApi.register({ email, password, firstName, lastName })

        token.value = res.token
        user.value = {
            userId: res.userId,
            email: res.email,
        }

        await navigateTo('/dashboard')
    }

    async function logout() {
        try {
            await authApi.logout()
        } catch {
            // Still clear local state and redirect if backend fails (e.g. no token, network)
        }
        token.value = null
        user.value = null
        return navigateTo('/login')
    }

    return {
        token,
        user,
        isAuthed,
        login,
        register,
        logout,
    }
}
