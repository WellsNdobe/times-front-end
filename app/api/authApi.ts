// app/api/authApi.ts
import { apiClient } from "~/api/apiClient"

export type LoginPayload = { email: string; password: string }

export type registerPayload = { email: string; password: string, firstName: string , lastName: string }

export type AuthLoginResponse = {
    userId: string
    email: string
    token: string
}

export const authApi = {
        login(payload: LoginPayload) {
            return apiClient<AuthLoginResponse>("/auth/login", {
                method: "POST",
                body: payload,
            })
        },
        register(payload: registerPayload) {
            return apiClient<AuthLoginResponse>("/auth/register", {
                method: "POST",
                body: payload,
            })
        },
}
