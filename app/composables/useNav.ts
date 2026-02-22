import { computed } from "vue"
import { useAuth } from "~/composables/useAuth"

export type NavItem = {
    label: string
    to: string
    icon: string
}

export type NavGroup = {
    label: string
    items: NavItem[]
}

const employeeOnlyRoutes = new Set([
    "/track",
    "/timesheets",
    "/projects",
    "/profile",
])

const baseNav: NavGroup[] = [
    {
        label: "Overview",
        items: [
            { label: "Dashboard", to: "/dashboard", icon: "mdi:view-dashboard-outline" },
        ],
    },
    {
        label: "Time",
        items: [
            { label: "Track", to: "/track", icon: "mdi:timer-outline" },
            { label: "Timesheet", to: "/timesheets", icon: "mdi:calendar-week-outline" },
            { label: "Approvals", to: "/approvals", icon: "mdi:check-decagram-outline" },
        ],
    },
    {
        label: "Insights",
        items: [
            { label: "Reports", to: "/reports", icon: "mdi:chart-box-outline" },
        ],
    },
    {
        label: "Workspace",
        items: [
            { label: "Projects", to: "/projects", icon: "mdi:briefcase-outline" },
            { label: "Clients", to: "/clients", icon: "mdi:account-multiple-outline" },
            { label: "Team", to: "/team", icon: "mdi:account-group-outline" },
        ],
    },
    {
        label: "Self Service",
        items: [
            { label: "My Profile", to: "/profile", icon: "mdi:account-circle-outline" },
        ],
    },
]

export function useNav() {
    const { token } = useAuth()

    const nav = computed(() => {
        const roles = getRolesFromToken(token.value)
        const isEmployeeOnly = roles.length > 0 && roles.every((role) => role === "employee")
        if (isEmployeeOnly) {
            return baseNav
                .map((group) => ({
                    ...group,
                    items: group.items.filter((item) => employeeOnlyRoutes.has(item.to)),
                }))
                .filter((group) => group.items.length > 0)
        }
        return baseNav
    })

    return nav
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
