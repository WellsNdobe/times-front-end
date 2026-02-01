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
          :data-tooltip="collapsed ? 'Open sidebar' : null"
      >
        <span class="logo-mark" aria-hidden="true">
          <Icon name="mdi:clock-outline" size="18" />
        </span>
        <span v-if="!collapsed" class="logo-text">
          <Icon name="mdi:timer-sand-complete" size="20" aria-hidden="true" />
          <span class="sr-only">Times</span>
        </span>
      </button>

      <!-- Collapse button only when expanded (right aligned) -->
      <button
          v-if="!collapsed"
          class="icon-btn"
          @click="$emit('collapse')"
          aria-label="Collapse sidebar"
          title="Collapse"
      >
        <Icon name="mdi:chevron-left" size="22" aria-hidden="true" />
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
            :title="item.label"
            :data-tooltip="collapsed ? item.label : null"
            @click="$emit('close-mobile')"
        >
  <span class="nav-item__icon" aria-hidden="true">
    <Icon :name="item.icon" size="30" />
  </span>
          <span class="nav-item__label" v-if="!collapsed">{{ item.label }}</span>
        </NuxtLink>

      </div>
    </nav>

    <div class="sidebar__footer">
      <button
          class="footer-btn"
          type="button"
          aria-label="FAQ"
          title="FAQ"
          :data-tooltip="collapsed ? 'FAQ' : null"
      >
        <span class="footer-btn__icon" aria-hidden="true">
          <Icon name="mdi:help-circle-outline" size="22" />
        </span>
        <span v-if="!collapsed" class="footer-btn__label">FAQ</span>
      </button>

      <button
          class="footer-btn footer-btn--logout"
          type="button"
          aria-label="Logout"
          title="Logout"
          :data-tooltip="collapsed ? 'Logout' : null"
      >
        <span class="footer-btn__icon" aria-hidden="true">
          <Icon name="mdi:logout" size="22" />
        </span>
        <span v-if="!collapsed" class="footer-btn__label">Logout</span>
      </button>
    </div>
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
  min-width: 0; /* allow grid item to shrink below content size when collapsed */
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
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--primary-soft);
  color: var(--primary);
}
.logo-mark :deep(svg) {
  color: inherit;
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
  flex: 1;
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
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Footer actions */
.sidebar__footer {
  border-top: 1px solid var(--border);
  padding: var(--s-3);
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.footer-btn {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 10px 12px;
  border-radius: var(--r-sm);
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--text-1);
}

.footer-btn:hover {
  background: var(--surface-2);
}

.footer-btn--logout {
  color: var(--danger);
}

.footer-btn--logout:hover {
  background: rgba(231, 76, 60, 0.12);
}

.footer-btn__icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.footer-btn__label {
  font-weight: 600;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Collapsed sidebar */
.sidebar--collapsed {
  width: 72px;
  min-width: 72px;
  max-width: 72px;
}
.sidebar--collapsed .nav {
  padding: var(--s-3) var(--s-2);
}

.sidebar--collapsed .logo-btn,
.sidebar--collapsed .nav-item,
.sidebar--collapsed .footer-btn {
  position: relative;
}

.sidebar--collapsed .logo-btn::after,
.sidebar--collapsed .nav-item::after,
.sidebar--collapsed .footer-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--text-1);
  color: var(--surface);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  box-shadow: var(--shadow-sm);
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 60;
}

.sidebar--collapsed .logo-btn::before,
.sidebar--collapsed .nav-item::before,
.sidebar--collapsed .footer-btn::before {
  content: "";
  position: absolute;
  left: calc(100% + 4px);
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: var(--text-1);
  opacity: 0;
  transition: opacity 0.8s ease;
  z-index: 59;
}

.sidebar--collapsed .logo-btn:hover::after,
.sidebar--collapsed .nav-item:hover::after,
.sidebar--collapsed .footer-btn:hover::after,
.sidebar--collapsed .logo-btn:focus-visible::after,
.sidebar--collapsed .nav-item:focus-visible::after,
.sidebar--collapsed .footer-btn:focus-visible::after {
  opacity: 1;
  transform: translateY(-50%) translateX(2px);
}

.sidebar--collapsed .logo-btn:hover::before,
.sidebar--collapsed .nav-item:hover::before,
.sidebar--collapsed .footer-btn:hover::before,
.sidebar--collapsed .logo-btn:focus-visible::before,
.sidebar--collapsed .nav-item:focus-visible::before,
.sidebar--collapsed .footer-btn:focus-visible::before {
  opacity: 1;
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
