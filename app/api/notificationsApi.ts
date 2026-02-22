// app/api/notificationsApi.ts - matches backend api/v1/organizations/{organizationId}/notifications
import { apiClient } from "~/api/apiClient"

export type Notification = {
    id: string
    organizationId: string
    recipientUserId: string
    actorUserId?: string | null
    timesheetId?: string | null
    type: number
    title: string
    message: string
    createdAtUtc: string
    readAtUtc?: string | null
    isRead: boolean
}

export type ListNotificationsParams = {
    unreadOnly?: boolean
    take?: number
}

export const notificationsApi = {
    /** GET api/v1/organizations/{organizationId}/notifications */
    list(organizationId: string, params?: ListNotificationsParams) {
        const query = params
            ? new URLSearchParams(
                  Object.entries(params).reduce((acc, [key, value]) => {
                      if (value === undefined) return acc
                      acc[key] = String(value)
                      return acc
                  }, {} as Record<string, string>)
              ).toString()
            : ""
        const url = `/v1/organizations/${organizationId}/notifications${query ? `?${query}` : ""}`
        return apiClient<Notification[]>(url, { method: "GET" })
    },

    /** POST api/v1/organizations/{organizationId}/notifications/mark-read */
    markRead(organizationId: string, ids: string[]) {
        return apiClient<{ updated: number }>(
            `/v1/organizations/${organizationId}/notifications/mark-read`,
            {
                method: "POST",
                body: { ids },
            }
        )
    },

    /** POST api/v1/organizations/{organizationId}/notifications/mark-all-read */
    markAllRead(organizationId: string) {
        return apiClient<{ updated: number }>(
            `/v1/organizations/${organizationId}/notifications/mark-all-read`,
            {
                method: "POST",
            }
        )
    },

    /** POST api/v1/organizations/{organizationId}/notifications/reminder */
    createReminder(organizationId: string) {
        return apiClient<Notification | null>(
            `/v1/organizations/${organizationId}/notifications/reminder`,
            {
                method: "POST",
            }
        )
    },
}
