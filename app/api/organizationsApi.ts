// app/api/organizationsApi.ts – matches backend api/v1/organizations
import { apiClient } from "~/api/apiClient"

export type Organization = {
    id: string
    name: string
    slug?: string
    [key: string]: unknown
}

export type CreateOrganizationRequest = {
    name: string
}

export type CreateOrganizationResponse = Organization

export type UpdateOrganizationRequest = {
    name?: string
    slug?: string
}

export type OrganizationMember = {
    id: string
    userId?: string
    email?: string
    displayName?: string
    role?: string
    [key: string]: unknown
}

export type AddMemberRequest = {
    email: string
    role?: string
}

export type UpdateMemberRequest = {
    role?: string
}

export const organizationsApi = {
    /** GET api/v1/organizations/mine */
    getMine() {
        return apiClient<Organization[]>("/v1/organizations/mine", {
            method: "GET",
        })
    },

    /** POST api/v1/organizations */
    create(payload: CreateOrganizationRequest) {
        return apiClient<CreateOrganizationResponse>("/v1/organizations", {
            method: "POST",
            body: payload,
        })
    },

    /** GET api/v1/organizations/{organizationId} */
    getById(organizationId: string) {
        return apiClient<Organization>(`/v1/organizations/${organizationId}`, {
            method: "GET",
        })
    },

    /** PATCH api/v1/organizations/{organizationId} */
    update(organizationId: string, payload: UpdateOrganizationRequest) {
        return apiClient<Organization>(`/v1/organizations/${organizationId}`, {
            method: "PATCH",
            body: payload,
        })
    },

    /** GET api/v1/organizations/{organizationId}/members */
    getMembers(organizationId: string) {
        return apiClient<OrganizationMember[]>(`/v1/organizations/${organizationId}/members`, {
            method: "GET",
        })
    },

    /** POST api/v1/organizations/{organizationId}/members */
    addMember(organizationId: string, payload: AddMemberRequest) {
        return apiClient<OrganizationMember>(`/v1/organizations/${organizationId}/members`, {
            method: "POST",
            body: payload,
        })
    },

    /** PATCH api/v1/organizations/{organizationId}/members/{memberId} */
    updateMember(organizationId: string, memberId: string, payload: UpdateMemberRequest) {
        return apiClient<OrganizationMember>(
            `/v1/organizations/${organizationId}/members/${memberId}`,
            { method: "PATCH", body: payload }
        )
    },
}
