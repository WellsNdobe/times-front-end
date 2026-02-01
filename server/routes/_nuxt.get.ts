// Handle GET /_nuxt/ (no asset path) so it doesn't log as unhandled 404.
// Real assets are /_nuxt/<filename> and are served by Vite.
export default defineEventHandler(() => {
  setResponseStatus(404)
  return ""
})
