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
    organizationId: string
    userId: string
    firstName?: string
    lastName?: string
    role: number
    isActive: boolean
    createdAtUtc: string
    updatedAtUtc: string
}

export type AddMemberRequest = {
    userId: string
    role: number
}

export type CreateUserMemberRequest = {
    email: string
    firstName: string
    lastName: string
    password: string
    role: number
}

export type UpdateMemberRequest = {
    role?: number
    isActive?: boolean
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

    /** POST api/v1/organizations/{organizationId}/members/create-user */
    createMemberWithUser(organizationId: string, payload: CreateUserMemberRequest) {
        return apiClient<OrganizationMember>(
            `/v1/organizations/${organizationId}/members/create-user`,
            {
                method: "POST",
                body: payload,
            }
        )
    },

    /** PATCH api/v1/organizations/{organizationId}/members/{memberId} */
    updateMember(organizationId: string, memberId: string, payload: UpdateMemberRequest) {
        return apiClient<OrganizationMember>(
            `/v1/organizations/${organizationId}/members/${memberId}`,
            { method: "PATCH", body: payload }
        )
    },
}
