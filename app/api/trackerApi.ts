import { apiClient } from "~/api/apiClient"
import type { TimesheetEntry } from "~/api/timesheetEntriesApi"

export type ActiveTimerSession = {
    id: string
    organizationId: string
    userId: string
    timesheetId: string
    projectId: string
    workDate: string
    notes: string | null
    startedAtUtc: string
    utcOffsetMinutes: number
    createdAtUtc: string
    updatedAtUtc: string
}

export type StartActiveTimerSessionRequest = {
    timesheetId: string
    projectId: string
    workDate: string
    notes?: string | null
    utcOffsetMinutes: number
}

export type UpdateActiveTimerSessionRequest = {
    notes?: string | null
}

export type StopActiveTimerSessionRequest = {
    notes?: string | null
}

export const trackerApi = {
    get(organizationId: string) {
        return apiClient<ActiveTimerSession>(`/v1/organizations/${organizationId}/tracker/session`, {
            method: "GET",
        })
    },

    start(organizationId: string, payload: StartActiveTimerSessionRequest) {
        return apiClient<ActiveTimerSession>(
            `/v1/organizations/${organizationId}/tracker/session/start`,
            { method: "POST", body: payload }
        )
    },

    update(organizationId: string, payload: UpdateActiveTimerSessionRequest) {
        return apiClient<ActiveTimerSession>(`/v1/organizations/${organizationId}/tracker/session`, {
            method: "PATCH",
            body: payload,
        })
    },

    stop(organizationId: string, payload?: StopActiveTimerSessionRequest) {
        return apiClient<TimesheetEntry>(`/v1/organizations/${organizationId}/tracker/session/stop`, {
            method: "POST",
            body: payload ?? {},
        })
    },

    discard(organizationId: string) {
        return apiClient<void>(`/v1/organizations/${organizationId}/tracker/session`, {
            method: "DELETE",
        })
    },
}
