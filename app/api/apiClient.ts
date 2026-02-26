export const apiClient = $fetch.create({
    baseURL: "/api",
    onRequest({ options }) {
        if (import.meta.server) {
            const config = useRuntimeConfig()
            options.baseURL = config.public.apiBase
        }
        const token = useCookie<string | null>("auth_token").value
        if (!token) return
        const headers = new Headers(options.headers as HeadersInit)
        headers.set("Authorization", `Bearer ${token}`)
        options.headers = headers
    },
})
