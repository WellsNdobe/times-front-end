// app/api/projectsApi.ts - matches backend api/v1/organizations/{organizationId}/projects
import { apiClient } from "~/api/apiClient"

export type Project = {
    id: string
    name: string
    clientId?: string
    clientName?: string
    isActive?: boolean
    organizationId?: string
    approverUserIds?: string[]
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

export type ProjectAssignment = {
    id: string
    projectId: string
    userId: string
    assignedByUserId?: string
    assignedAtUtc: string
    [key: string]: unknown
}

export type ProjectApprover = {
    id: string
    projectId: string
    userId: string
    assignedByUserId?: string
    assignedAtUtc: string
    [key: string]: unknown
}

export type AssignUserToProjectRequest = {
    userId: string
}

export type AssignApproverToProjectRequest = {
    userId: string
}

export const projectsApi = {
    create(organizationId: string, payload: CreateProjectRequest) {
        return apiClient<Project>(`/v1/organizations/${organizationId}/projects`, {
            method: "POST",
            body: payload,
        })
    },

    list(organizationId: string, params?: ListProjectsParams) {
        const search = new URLSearchParams()
        if (params?.isActive !== undefined) search.set("isActive", String(params.isActive))
        if (params?.clientId) search.set("clientId", params.clientId)
        const query = search.toString()
        const url = `/v1/organizations/${organizationId}/projects${query ? `?${query}` : ""}`
        return apiClient<Project[]>(url, { method: "GET" })
    },

    getById(organizationId: string, projectId: string) {
        return apiClient<Project>(
            `/v1/organizations/${organizationId}/projects/${projectId}`,
            { method: "GET" }
        )
    },

    update(organizationId: string, projectId: string, payload: UpdateProjectRequest) {
        return apiClient<Project>(
            `/v1/organizations/${organizationId}/projects/${projectId}`,
            { method: "PATCH", body: payload }
        )
    },

    getAssignments(organizationId: string, projectId: string) {
        return apiClient<ProjectAssignment[]>(
            `/v1/organizations/${organizationId}/projects/${projectId}/assignments`,
            { method: "GET" }
        )
    },

    assignUser(organizationId: string, projectId: string, payload: AssignUserToProjectRequest) {
        return apiClient<ProjectAssignment>(
            `/v1/organizations/${organizationId}/projects/${projectId}/assignments`,
            { method: "POST", body: payload }
        )
    },

    unassignUser(organizationId: string, projectId: string, userId: string) {
        return apiClient<void>(
            `/v1/organizations/${organizationId}/projects/${projectId}/assignments/${userId}`,
            { method: "DELETE" }
        )
    },

    getApprovers(organizationId: string, projectId: string) {
        return apiClient<ProjectApprover[]>(
            `/v1/organizations/${organizationId}/projects/${projectId}/approvers`,
            { method: "GET" }
        )
    },

    assignApprover(organizationId: string, projectId: string, payload: AssignApproverToProjectRequest) {
        return apiClient<ProjectApprover>(
            `/v1/organizations/${organizationId}/projects/${projectId}/approvers`,
            { method: "POST", body: payload }
        )
    },

    unassignApprover(organizationId: string, projectId: string, userId: string) {
        return apiClient<void>(
            `/v1/organizations/${organizationId}/projects/${projectId}/approvers/${userId}`,
            { method: "DELETE" }
        )
    },
}
