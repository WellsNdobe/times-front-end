// app/api/apiClient.ts
import type { FetchOptions } from "ofetch"

export const apiClient = $fetch.create({
    baseURL: "/api",
    onRequest({ options }: { options: FetchOptions }) {
        // Resolve base URL in request context so useRuntimeConfig() is valid (SSR)
        if (process.server) {
            const config = useRuntimeConfig()
            const path = (options.url as string)?.replace(/^\/api/, "") || "/"
            options.url = config.public.apiBase.replace(/\/$/, "") + path
        }
        const token = useCookie<string | null>("auth_token").value
        if (!token) return
        const headers = new Headers(options.headers as HeadersInit)
        headers.set("Authorization", `Bearer ${token}`)
        options.headers = headers
    },
})
