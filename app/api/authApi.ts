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
    register(payload: registerPayload) {
        return $fetch<AuthLoginResponse>("/api/auth/register", {
            method: "POST",
            body: payload,
        })
    },

    login(payload: LoginPayload) {
        return $fetch<AuthLoginResponse>("/api/auth/login", {
            method: "POST",
            body: payload,
        })
    },
}
