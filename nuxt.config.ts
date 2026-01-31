// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/image', '@nuxt/ui', '@nuxt/hints'],
    css: [
        '@/assets/styles/tokens.css',
        '@/assets/styles/base.css'
    ]
})