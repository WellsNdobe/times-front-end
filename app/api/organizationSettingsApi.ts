import { apiClient } from "~/api/apiClient"
import type { WeekStartDay } from "~/api/userPreferencesApi"

export type OrganizationSettings = {
    organizationId: string
    weekStartDay: WeekStartDay
    weeklyHoursTarget: number
    createdAtUtc?: string | null
    updatedAtUtc?: string | null
}

export type UpdateOrganizationSettingsRequest = {
    weekStartDay: WeekStartDay
    weeklyHoursTarget: number
}

export const organizationSettingsApi = {
    get(organizationId: string) {
        return apiClient<OrganizationSettings>(`/v1/organizations/${organizationId}/settings`, {
            method: "GET",
        })
    },

    update(organizationId: string, payload: UpdateOrganizationSettingsRequest) {
        return apiClient<OrganizationSettings>(`/v1/organizations/${organizationId}/settings`, {
            method: "PATCH",
            body: payload,
        })
    },
}
