export type NavItem = {
    label: string
    to: string
    icon: string
    roles?: string[]
}

export type NavGroup = {
    label: string
    items: NavItem[]
}

export function useNav(): NavGroup[] {
    return [
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
    ];

}
