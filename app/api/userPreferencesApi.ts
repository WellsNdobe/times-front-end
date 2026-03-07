import { apiClient } from "~/api/apiClient"

export type WeekStartDay = "monday" | "sunday"
export type ReminderDay =
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday"

export type UserPreferences = {
    organizationId: string
    userId: string
    weeklyHoursTarget: number
    weekStartDay: WeekStartDay
    defaultClientId: string | null
    defaultProjectId: string | null
    timeZone: string
    managerMemberId: string | null
    backupApproverMemberId: string | null
    autoReminders: boolean
    reminderDay: ReminderDay
    reminderTime: string
    createdAtUtc?: string | null
    updatedAtUtc?: string | null
}

export type UpdateUserPreferencesRequest = {
    weeklyHoursTarget: number
    weekStartDay: WeekStartDay
    defaultClientId: string | null
    defaultProjectId: string | null
    timeZone: string
    managerMemberId: string | null
    backupApproverMemberId: string | null
    autoReminders: boolean
    reminderDay: ReminderDay
    reminderTime: string
}

export const userPreferencesApi = {
    getMe(organizationId: string) {
        return apiClient<UserPreferences>(`/v1/organizations/${organizationId}/users/me/preferences`, {
            method: "GET",
        })
    },

    updateMe(organizationId: string, payload: UpdateUserPreferencesRequest) {
        return apiClient<UserPreferences>(`/v1/organizations/${organizationId}/users/me/preferences`, {
            method: "PATCH",
            body: payload,
        })
    },
}
