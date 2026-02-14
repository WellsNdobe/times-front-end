// app/api/timesheetsApi.ts – matches backend api/v1/organizations/{organizationId}/timesheets
import { apiClient } from "~/api/apiClient"

export type Timesheet = {
    id: string
    weekStartDate: string
    organizationId?: string
    createdAtUtc?: string
    updatedAtUtc?: string
    [key: string]: unknown
}

export type CreateTimesheetRequest = {
    weekStartDate: string
}

export type ListTimesheetsParams = {
    weekStartDate?: string
}

export const timesheetsApi = {
    /** GET api/v1/organizations/{organizationId}/timesheets */
    list(organizationId: string, params?: ListTimesheetsParams) {
        const search = new URLSearchParams()
        if (params?.weekStartDate) search.set("weekStartDate", params.weekStartDate)
        const query = search.toString()
        const url = `/v1/organizations/${organizationId}/timesheets${query ? `?${query}` : ""}`
        return apiClient<Timesheet[]>(url, { method: "GET" })
    },

    /** POST api/v1/organizations/{organizationId}/timesheets */
    create(organizationId: string, payload: CreateTimesheetRequest) {
        return apiClient<Timesheet>(`/v1/organizations/${organizationId}/timesheets`, {
            method: "POST",
            body: payload,
        })
    },
}
