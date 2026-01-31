<template>
  <!-- Sidebar (full height, reaches top) -->
  <aside
      class="sidebar"
      :class="{
      'sidebar--collapsed': collapsed,
      'sidebar--open': mobileOpen
    }"
  >
    <div class="sidebar__header">
      <!-- Logo becomes open button when collapsed -->
      <button
          class="logo-btn"
          @click="onLogoClick"
          :title="collapsed ? 'Open sidebar' : 'Home'"
      >
        <span class="logo-mark">T</span>
        <span v-if="!collapsed" class="logo-text">Times</span>
      </button>

      <!-- Collapse button only when expanded (right aligned) -->
      <button
          v-if="!collapsed"
          class="icon-btn"
          @click="$emit('collapse')"
          aria-label="Collapse sidebar"
          title="Collapse"
      >
        ⟨
      </button>
    </div>

    <nav class="nav">
      <div v-for="group in nav" :key="group.label" class="nav-group">
        <div class="nav-group__label" v-if="!collapsed">{{ group.label }}</div>

        <NuxtLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ 'nav-item--active': currentPath === item.to }"
            @click="$emit('close-mobile')"
        >
  <span class="nav-item__icon" aria-hidden="true">
    <Icon :name="item.icon" size="30" />
  </span>
          <span class="nav-item__label" v-if="!collapsed">{{ item.label }}</span>
        </NuxtLink>

      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
type NavItem = { to: string; label: string; icon: string }
type NavGroup = { label: string; items: NavItem[] }

const props = defineProps<{
  nav: NavGroup[]
  collapsed: boolean
  mobileOpen: boolean
  currentPath: string
}>()

const emit = defineEmits<{
  (e: 'collapse'): void
  (e: 'logo-click'): void
  (e: 'close-mobile'): void
}>()

function onLogoClick() {
  emit('logo-click')
}
</script>

<style scoped>
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

/* Collapse button */
.icon-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 8px;
  border-radius: var(--r-sm);
}
.icon-btn:hover {
  background: var(--surface-2);
}

/* Nav */
.nav {
  padding: var(--s-3);
  overflow: auto;
}

.nav-group {
  margin-bottom: var(--s-4);
}

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
.nav-item:hover {
  background: var(--surface-2);
}

.nav-item--active {
  background: var(--primary-soft);
  color: var(--primary);
}

.nav-item__icon {
  width: 20px;
  text-align: center;
}

/* Collapsed sidebar */
.sidebar--collapsed {
  width: 72px;
}
.sidebar--collapsed .nav {
  padding: var(--s-3) var(--s-2);
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

/* Mobile behavior: sidebar becomes drawer overlay */
@media (max-width: 960px) {
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
}
</style>
