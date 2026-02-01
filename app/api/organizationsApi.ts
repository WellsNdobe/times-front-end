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
}
