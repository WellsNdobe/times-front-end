// app/api/authApi.ts
import { apiClient } from "~/api/apiClient"

export type LoginRequest = {
    email: string
    password: string
}

export type RegisterRequest = {
    email: string
    password: string
    firstName: string
    lastName: string
}

export type AuthResponse = {
    userId: string
    email: string
    token: string | null
}

export const authApi = {
        login(payload: LoginRequest) {
            return apiClient<AuthResponse>("/auth/login", {
                method: "POST",
                body: payload,
            })
        },
        register(payload: RegisterRequest) {
            return apiClient<AuthResponse>("/auth/register", {
                method: "POST",
                body: payload,
            })
        },
        /** Calls backend to revoke the current token. */
        logout() {
            return apiClient<{ message: string }>("/auth/logout", {
                method: "POST",
            })
        },
}
