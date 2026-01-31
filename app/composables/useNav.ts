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
            label: 'General',
            items: [
                { label: 'Dashboard', to: '/dashboard', icon: 'mdi:home' },
                { label: 'Timesheets', to: '/timesheets', icon: 'mdi:file-document-outline' },


            ]
        },
        {
            label: 'Self Service',
            items: [
                { label: 'My Profile', to: '/profile', icon: 'mdi:account' }
            ]
        }
    ]
}
