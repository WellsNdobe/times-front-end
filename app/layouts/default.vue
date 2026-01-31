<template>
  <div class="shell">
    <!-- Sidebar (full height, reaches top) -->
    <aside
        class="sidebar"
        :class="{
        'sidebar--collapsed': isCollapsed,
        'sidebar--open': isMobileOpen
      }"
    >
      <div class="sidebar__header">
        <!-- Logo becomes open button when collapsed -->
        <button class="logo-btn" @click="onLogoClick" :title="isCollapsed ? 'Open sidebar' : 'Home'">
          <span class="logo-mark">T</span>
          <span v-if="!isCollapsed" class="logo-text">Times</span>
        </button>

        <!-- Collapse button only when expanded (right aligned) -->
        <button
            v-if="!isCollapsed"
            class="icon-btn"
            @click="collapseSidebar"
            aria-label="Collapse sidebar"
            title="Collapse"
        >
          ⟨
        </button>
      </div>

      <nav class="nav">
        <div v-for="group in nav" :key="group.label" class="nav-group">
          <div class="nav-group__label" v-if="!isCollapsed">{{ group.label }}</div>

          <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="nav-item"
              :class="{ 'nav-item--active': route.path === item.to }"
              @click="isMobileOpen = false"
          >
            <span class="nav-item__icon" aria-hidden="true">{{ item.icon }}</span>
            <span class="nav-item__label" v-if="!isCollapsed">{{ item.label }}</span>
          </NuxtLink>
        </div>
      </nav>
    </aside>

    <!-- Topbar ONLY for main column -->
    <header class="topbar">
      <!-- Mobile hamburger -->
      <button class="icon-btn" @click="openMobileSidebar" aria-label="Open navigation">
        ☰
      </button>

      <div class="topbar__title">{{ pageTitle }}</div>

      <div class="topbar__actions">
        <button class="btn btn-secondary">My Profile</button>
      </div>
    </header>

    <!-- Backdrop for mobile drawer -->
    <div v-if="isMobileOpen" class="backdrop" @click="isMobileOpen = false"></div>

    <!-- Main -->
    <main class="main">
      <NuxtPage />
    </main>
  </div>
</template>


<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNav } from '~/composables/useNav'

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

function collapseSidebar() {
  isCollapsed.value = true
}

function onLogoClick() {
  // ChatGPT-like: logo expands when collapsed, otherwise goes home (or whatever you prefer)
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

/* Sidebar full height */
.sidebar {
  grid-area: sidebar;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar__header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--s-3);
  border-bottom: 1px solid var(--border);
}

.logo-btn {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  background: transparent;
  border: 0;
  padding: 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
}

.logo-btn:hover {
  background: var(--surface-2);
}

.logo-mark {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 800;
}

.logo-text {
  font-weight: 800;
  letter-spacing: 0.2px;
  color: var(--text-1);
}

/* Collapse button (right aligned naturally by space-between) */
.icon-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 8px;
  border-radius: var(--r-sm);
}
.icon-btn:hover { background: var(--surface-2); }

/* Nav */
.nav {
  padding: var(--s-3);
  overflow: auto;
}

.nav-group { margin-bottom: var(--s-4); }

.nav-group__label {
  font-size: 12px;
  color: var(--text-3);
  font-weight: 700;
  margin: var(--s-2) 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 10px 12px;
  border-radius: var(--r-sm);
  color: var(--text-1);
}
.nav-item:hover { background: var(--surface-2); }

.nav-item--active {
  background: var(--primary-soft);
  color: var(--primary);
}

.nav-item__icon { width: 20px; text-align: center; }

/* Collapsed sidebar */
.sidebar--collapsed {
  width: 72px;
}
.sidebar--collapsed .nav {
  padding: var(--s-3) var(--s-2);
}

/* Topbar only in main column */
.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--s-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar__title {
  font-weight: 700;
  color: var(--text-1);
}

/* Main content */
.main {
  grid-area: main;
  padding: var(--s-5);
}

/* Mobile behavior: sidebar becomes drawer overlay */
@media (max-width: 960px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-areas:
      "topbar"
      "main";
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 280px;
    transform: translateX(-110%);
    box-shadow: var(--shadow-md);
    z-index: 50;
  }
  .sidebar--open {
    transform: translateX(0);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.25);
    z-index: 40;
  }
}
.sidebar--collapsed .logo-btn::after {
  content: "›";
  margin-left: 6px;
  color: var(--text-3);
  font-weight: 700;
  opacity: 0;
  transform: translateX(-2px);
  transition: 0.15s ease;
}
.sidebar--collapsed .logo-btn:hover::after {
  opacity: 1;
  transform: translateX(0);
}

</style>

