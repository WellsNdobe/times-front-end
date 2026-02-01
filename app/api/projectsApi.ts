// app/api/projectsApi.ts – matches backend api/v1/organizations/{organizationId}/projects
import { apiClient } from "~/api/apiClient"

export type Project = {
    id: string
    name: string
    clientId?: string
    clientName?: string
    isActive?: boolean
    organizationId?: string
    [key: string]: unknown
}

export type CreateProjectRequest = {
    name: string
    clientId?: string
    isActive?: boolean
}

export type UpdateProjectRequest = {
    name?: string
    clientId?: string
    isActive?: boolean
}

export type ListProjectsParams = {
    isActive?: boolean
    clientId?: string
}

export const projectsApi = {
    /** POST api/v1/organizations/{organizationId}/projects */
    create(organizationId: string, payload: CreateProjectRequest) {
        return apiClient<Project>(`/v1/organizations/${organizationId}/projects`, {
            method: "POST",
            body: payload,
        })
    },

    /** GET api/v1/organizations/{organizationId}/projects */
    list(organizationId: string, params?: ListProjectsParams) {
        const search = new URLSearchParams()
        if (params?.isActive !== undefined) search.set("isActive", String(params.isActive))
        if (params?.clientId) search.set("clientId", params.clientId)
        const query = search.toString()
        const url = `/v1/organizations/${organizationId}/projects${query ? `?${query}` : ""}`
        return apiClient<Project[]>(url, { method: "GET" })
    },

    /** GET api/v1/organizations/{organizationId}/projects/{projectId} */
    getById(organizationId: string, projectId: string) {
        return apiClient<Project>(
            `/v1/organizations/${organizationId}/projects/${projectId}`,
            { method: "GET" }
        )
    },

    /** PATCH api/v1/organizations/{organizationId}/projects/{projectId} */
    update(organizationId: string, projectId: string, payload: UpdateProjectRequest) {
        return apiClient<Project>(
            `/v1/organizations/${organizationId}/projects/${projectId}`,
            { method: "PATCH", body: payload }
        )
    },
}
