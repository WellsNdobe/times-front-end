// Redirect to create-organization if the user has no organizations (must run after auth).
// Only run the API check on the client so we use the browser's /api (proxy); on the server
// the Nuxt process may not be able to reach apiBase (e.g. localhost from Docker).
import { organizationsApi } from "~/api/organizationsApi"

export default defineNuxtRouteMiddleware(async (to) => {
    if (to.path === "/onboarding/create-organization") return

    if (process.server) return

    try {
        const orgs = await organizationsApi.getMine()
        if (!orgs?.length) return navigateTo("/onboarding/create-organization")
    } catch {
        return navigateTo("/onboarding/create-organization")
    }
})
