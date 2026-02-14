// https://nuxt.com/docs/api/configuration/nuxt-config
const apiOrigin = process.env.NUXT_API_ORIGIN || 'http://127.0.0.1:5275'
const normalizedApiOrigin = apiOrigin.replace(/\/$/, '')

export default defineNuxtConfig({
    components: [
        { path: '~/app/components', pathPrefix: false },
    ],
    compatibilityDate: '2025-07-15',
    devtools: { enabled: true },
    modules: ['@nuxt/image', '@nuxt/ui', '@nuxt/hints', 'nuxt-icon'],
    css: [
        '~/assets/styles/tokens.css',
        '~/assets/styles/base.css',
    ],
    runtimeConfig: {
        public: {
            apiBase: process.env.NUXT_PUBLIC_API_BASE || `${normalizedApiOrigin}/api`,
        },
    },
    nitro: {
        devProxy: {
            '/api': {
                target: normalizedApiOrigin,
                changeOrigin: true,
            },
        },
    },
    vite: {
        server: {
            proxy: {
                '/api': {
                    target: normalizedApiOrigin,
                    changeOrigin: true,
                },
            },
        },
    },
})
