import { useAuth } from "~/composables/useAuth"

export default defineNuxtRouteMiddleware(() => {
    const { token } = useAuth()
    const roles = getRolesFromToken(token.value)
    const isEmployeeOnly = roles.length > 0 && roles.every((role) => role === "employee")
    if (isEmployeeOnly) return navigateTo("/timesheets")
})

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

function decodeJwtPayload(token: string) {
    const [, payload] = token.split(".")
    if (!payload) return null
    try {
        if (typeof atob !== "function") return null
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
        const decoded = atob(padded)
        return JSON.parse(decoded)
    } catch (error) {
        console.error("Failed to decode auth token payload:", error)
        return null
    }
}
