import { apiClient } from "~/api/apiClient"

export type ProjectDailyHoursReportRow = {
    organizationId: string
    workDate: string
    projectId: string
    projectName: string
    projectCode?: string | null
    clientId?: string | null
    clientName?: string | null
    userId: string
    userEmail: string
    userFirstName: string
    userLastName: string
    entryCount: number
    totalMinutes: number
    totalHours: number
}

export type ProjectDailyHoursParams = {
    fromDate?: string
    toDate?: string
    projectId?: string
    userId?: string
}

export const reportsApi = {
    /** GET api/v1/reports/project-daily-hours */
    getProjectDailyHours(organizationId: string, params?: ProjectDailyHoursParams) {
        const search = new URLSearchParams()
        search.set("organizationId", organizationId)
        if (params?.fromDate) search.set("fromDate", params.fromDate)
        if (params?.toDate) search.set("toDate", params.toDate)
        if (params?.projectId) search.set("projectId", params.projectId)
        if (params?.userId) search.set("userId", params.userId)

        return apiClient<ProjectDailyHoursReportRow[]>(`/v1/reports/project-daily-hours?${search.toString()}`, {
            method: "GET",
        })
    },
}
