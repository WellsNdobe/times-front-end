// app/api/clientsApi.ts – matches backend api/v1/organizations/{organizationId}/clients
import { apiClient } from "~/api/apiClient"

export type Client = {
    id: string
    name: string
    isActive?: boolean
    organizationId?: string
    createdAtUtc?: string
    updatedAtUtc?: string
    [key: string]: unknown
}

export type CreateClientRequest = {
    name: string
}

export const clientsApi = {
    /** GET api/v1/organizations/{organizationId}/clients */
    list(organizationId: string) {
        return apiClient<Client[]>(`/v1/organizations/${organizationId}/clients`, {
            method: "GET",
        })
    },

    /** POST api/v1/organizations/{organizationId}/clients */
    create(organizationId: string, payload: CreateClientRequest) {
        return apiClient<Client>(`/v1/organizations/${organizationId}/clients`, {
            method: "POST",
            body: payload,
        })
    },
}
