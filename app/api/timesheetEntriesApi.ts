// app/api/timesheetEntriesApi.ts – matches backend api/v1/organizations/{organizationId}/timesheets/{timesheetId}/entries
import { apiClient } from "~/api/apiClient"

export type TimesheetEntry = {
    id: string
    timesheetId?: string
    projectId: string
    taskId?: string | null
    workDate: string
    startTime?: string | null
    endTime?: string | null
    durationMinutes?: number | null
    notes?: string | null
    createdAtUtc?: string
    updatedAtUtc?: string
    [key: string]: unknown
}

export type TimesheetEntryPayload = {
    projectId: string
    taskId?: string | null
    workDate: string
    startTime?: string | null
    endTime?: string | null
    durationMinutes?: number | null
    notes?: string | null
}

export const timesheetEntriesApi = {
    /** GET api/v1/organizations/{organizationId}/timesheets/{timesheetId}/entries */
    list(organizationId: string, timesheetId: string) {
        return apiClient<TimesheetEntry[]>(
            `/v1/organizations/${organizationId}/timesheets/${timesheetId}/entries`,
            { method: "GET" }
        )
    },

    /** POST api/v1/organizations/{organizationId}/timesheets/{timesheetId}/entries */
    create(organizationId: string, timesheetId: string, payload: TimesheetEntryPayload) {
        return apiClient<TimesheetEntry>(
            `/v1/organizations/${organizationId}/timesheets/${timesheetId}/entries`,
            { method: "POST", body: payload }
        )
    },

    /** PATCH api/v1/organizations/{organizationId}/timesheets/{timesheetId}/entries/{entryId} */
    update(
        organizationId: string,
        timesheetId: string,
        entryId: string,
        payload: TimesheetEntryPayload
    ) {
        return apiClient<TimesheetEntry>(
            `/v1/organizations/${organizationId}/timesheets/${timesheetId}/entries/${entryId}`,
            { method: "PATCH", body: payload }
        )
    },

    /** DELETE api/v1/organizations/{organizationId}/timesheets/{timesheetId}/entries/{entryId} */
    remove(organizationId: string, timesheetId: string, entryId: string) {
        return apiClient<void>(
            `/v1/organizations/${organizationId}/timesheets/${timesheetId}/entries/${entryId}`,
            { method: "DELETE" }
        )
    },
}
