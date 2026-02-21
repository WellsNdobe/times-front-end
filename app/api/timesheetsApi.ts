// app/api/timesheetsApi.ts – matches backend api/v1/organizations/{organizationId}/timesheets
import { apiClient } from "~/api/apiClient"

export type Timesheet = {
    id: string
    weekStartDate: string
    weekEndDate?: string
    status?: number
    organizationId?: string
    userId?: string
    submittedAtUtc?: string
    totalMinutes?: number
    totalHours?: number
    rejectionReason?: string | null
    createdAtUtc?: string
    updatedAtUtc?: string
    [key: string]: unknown
}

export type CreateTimesheetRequest = {
    weekStartDate: string
}

export type SubmitTimesheetRequest = {
    comment?: string | null
}

export type ApproveTimesheetRequest = {
    comment?: string | null
}

export type RejectTimesheetRequest = {
    reason: string
}

export type ListTimesheetsParams = {
    fromWeekStart?: string
    toWeekStart?: string
}

export const timesheetsApi = {
    /** GET api/v1/organizations/{organizationId}/timesheets/mine */
    listMine(organizationId: string, params?: ListTimesheetsParams) {
        const search = new URLSearchParams()
        if (params?.fromWeekStart) search.set("fromWeekStart", params.fromWeekStart)
        if (params?.toWeekStart) search.set("toWeekStart", params.toWeekStart)
        const query = search.toString()
        const url = `/v1/organizations/${organizationId}/timesheets/mine${query ? `?${query}` : ""}`
        return apiClient<Timesheet[]>(url, { method: "GET" })
    },

    /** POST api/v1/organizations/{organizationId}/timesheets */
    create(organizationId: string, payload: CreateTimesheetRequest) {
        return apiClient<Timesheet>(`/v1/organizations/${organizationId}/timesheets`, {
            method: "POST",
            body: payload,
        })
    },

    /** POST api/v1/organizations/{organizationId}/timesheets/{timesheetId}/submit */
    submit(organizationId: string, timesheetId: string, payload?: SubmitTimesheetRequest) {
        return apiClient<Timesheet>(
            `/v1/organizations/${organizationId}/timesheets/${timesheetId}/submit`,
            { method: "POST", body: payload ?? {} }
        )
    },

    /** GET api/v1/organizations/{organizationId}/timesheets/pending-approval */
    listPendingApproval(organizationId: string, params?: ListTimesheetsParams) {
        const search = new URLSearchParams()
        if (params?.fromWeekStart) search.set("fromWeekStart", params.fromWeekStart)
        if (params?.toWeekStart) search.set("toWeekStart", params.toWeekStart)
        const query = search.toString()
        const url = `/v1/organizations/${organizationId}/timesheets/pending-approval${
            query ? `?${query}` : ""
        }`
        return apiClient<Timesheet[]>(url, { method: "GET" })
    },

    /** POST api/v1/organizations/{organizationId}/timesheets/{timesheetId}/approve */
    approve(
        organizationId: string,
        timesheetId: string,
        payload?: ApproveTimesheetRequest
    ) {
        return apiClient<Timesheet>(
            `/v1/organizations/${organizationId}/timesheets/${timesheetId}/approve`,
            { method: "POST", body: payload ?? {} }
        )
    },

    /** POST api/v1/organizations/{organizationId}/timesheets/{timesheetId}/reject */
    reject(organizationId: string, timesheetId: string, payload: RejectTimesheetRequest) {
        return apiClient<Timesheet>(
            `/v1/organizations/${organizationId}/timesheets/${timesheetId}/reject`,
            { method: "POST", body: payload }
        )
    },
}
