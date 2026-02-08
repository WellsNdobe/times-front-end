import { computed, onMounted, ref } from "vue"
import { organizationsApi } from "~/api/organizationsApi"
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
    "/approvals",
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
    const { user } = useAuth()
    const userRole = ref<number | null>(null)

    onMounted(async () => {
        if (!user.value?.userId) return
        try {
            const orgs = await organizationsApi.getMine()
            if (!orgs?.length) return
            const members = await organizationsApi.getMembers(orgs[0].id)
            const member = members.find((item) => item.userId === user.value?.userId)
            if (member) userRole.value = member.role
        } catch (error) {
            console.error("Failed to load user role for navigation:", error)
        }
    })

    const nav = computed(() => {
        if (userRole.value === 2) {
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
