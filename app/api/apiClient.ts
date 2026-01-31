// app/api/apiClient.ts
import type { FetchOptions } from "ofetch"

export const apiClient = $fetch.create({
    baseURL: "/api",
    onRequest({ options }: { options: FetchOptions }) {
        const token = useCookie<string | null>("auth_token").value
        if (!token) return
        const headers = new Headers(options.headers as HeadersInit)
        headers.set("Authorization", `Bearer ${token}`)
        options.headers = headers
    },
})
