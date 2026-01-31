// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    components: [
    { path: '~/app/components', pathPrefix: false },
    { path: '~/features', pathPrefix: false }
],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/image', '@nuxt/ui', '@nuxt/hints'],
    css: [
    '~/assets/styles/tokens.css',
    '~/assets/styles/base.css'],
    vite: {
        server: {
            proxy: {
                "/api": {
                    target: "http://localhost:5275",
                    changeOrigin: true,
                },
            },
        },
    },
})