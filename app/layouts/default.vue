<template>
  <div class="shell">
    <AppSidebar
        :nav="nav"
        :collapsed="isCollapsed"
        :mobileOpen="isMobileOpen"
        :currentPath="route.path"
        @collapse="collapseSidebar"
        @logo-click="onLogoClick"
        @close-mobile="isMobileOpen = false"
    />

    <AppTopbar :title="pageTitle" @open-mobile="openMobileSidebar" />

    <!-- Backdrop for mobile drawer -->
    <div v-if="isMobileOpen" class="backdrop" @click="isMobileOpen = false"></div>

    <main class="main">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNav } from '~/composables/useNav'

import AppSidebar from '~/components/shell/Sidebar.vue'
import AppTopbar from '~/components/shell/Topbar.vue'

const route = useRoute()
const router = useRouter()
const nav = useNav()

const isCollapsed = ref(false)
const isMobileOpen = ref(false)
const isMobile = ref(false)

function updateIsMobile() {
  isMobile.value = window.matchMedia('(max-width: 960px)').matches
  if (!isMobile.value) isMobileOpen.value = false
}

onMounted(() => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile)
})

function collapseSidebar() {
  isCollapsed.value = true
}

function onLogoClick() {
  if (isCollapsed.value) isCollapsed.value = false
  else router.push('/dashboard')
}

function openMobileSidebar() {
  if (isMobile.value) isMobileOpen.value = true
}

const pageTitle = computed(() => {
  if (route.path === '/dashboard') return 'Dashboard'
  if (route.path.startsWith('/timesheets')) return 'Timesheets'
  if (route.path === '/profile') return 'My Profile'
  return ''
})
</script>

<style scoped>
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    "sidebar topbar"
    "sidebar main";
}

.main {
  grid-area: main;
  padding: var(--s-5);
}

@media (max-width: 960px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-areas:
      "topbar"
      "main";
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.25);
    z-index: 40;
  }
}
</style>
