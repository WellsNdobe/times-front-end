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

    // Rehydrate user state after full page refresh using token claims.
    if (!user.value && token.value) {
        user.value = getUserFromToken(token.value)
    }

    async function login(email: string, password: string) {
        const res = await authApi.login({ email, password })

        token.value = res.token
        user.value = {
            userId: res.userId,
            email: res.email,
        }

        await navigateTo(getLandingPath(res.token))
    }

    async function register(email: string, password: string, firstName: string, lastName: string) {
        const res = await authApi.register({ email, password, firstName, lastName })

        token.value = res.token
        user.value = {
            userId: res.userId,
            email: res.email,
        }

        await navigateTo(getLandingPath(res.token))
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

function getUserFromToken(token: string): AuthUser | null {
    const payload = decodeJwtPayload(token)
    if (!payload || typeof payload !== 'object') return null

    const userId = typeof payload.sub === 'string'
        ? payload.sub
        : typeof payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] === 'string'
            ? payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
            : ''

    const email = typeof payload.email === 'string'
        ? payload.email
        : typeof payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] === 'string'
            ? payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
            : ''

    if (!userId) return null
    return { userId, email }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    const [, payload] = token.split('.')
    if (!payload) return null
    if (typeof atob !== 'function') return null
    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
        const decoded = atob(padded)
        return JSON.parse(decoded)
    } catch {
        return null
    }
}

function getLandingPath(token: string) {
    const roles = getRolesFromToken(token)
    const isEmployeeOnly = roles.length > 0 && roles.every((role) => role === "employee")
    return isEmployeeOnly ? "/timesheets" : "/dashboard"
}

function getRolesFromToken(token: string | null | undefined) {
    if (!token) return []
    const payload = decodeJwtPayload(token)
    if (!payload || typeof payload !== "object") return []
    const claimKey = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
    const rawRoles = [payload[claimKey], payload.role, payload.roles]
    return rawRoles
        .flatMap((role) => normalizeRoles(role))
        .map((role) => role.toLowerCase())
        .filter(Boolean)
}

function normalizeRoles(value: unknown): string[] {
    if (!value) return []
    if (Array.isArray(value)) {
        return value.filter((entry): entry is string => typeof entry === "string")
    }
    if (typeof value === "string") {
        return value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
    }
    return []
}
