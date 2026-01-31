<template>
  <header class="topbar">
    <!-- Mobile hamburger -->
    <button
        class="icon-btn hamburger"
        @click="$emit('open-mobile')"
        aria-label="Open navigation"
        type="button"
    >
      <Icon name="mdi:menu" size="22" />
    </button>

    <!-- Title -->
    <div class="topbar__title">{{ title }}</div>

    <div class="topbar__actions">
      <!-- Notifications -->
      <div class="menu">
        <button
            class="icon-btn"
            type="button"
            aria-label="Notifications"
            @click="toggleNotif"
        >
          <Icon name="mdi:bell-outline" size="22" />
          <span v-if="notifCount" class="badge">{{ notifCount }}</span>
        </button>

        <div v-if="isNotifOpen" class="menu__card">
          <div class="menu__header">
            <strong>Notifications</strong>
            <button class="link-btn" @click="markAllRead">
              Mark all read
            </button>
          </div>

          <div v-if="notifications.length === 0" class="menu__empty">
            You're all caught up.
          </div>

          <ul v-else class="menu__list">
            <li
                v-for="n in notifications"
                :key="n.id"
                class="menu__item"
            >
              <div class="menu__item-title">{{ n.title }}</div>
              <div class="menu__item-meta">{{ n.meta }}</div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Avatar -->
      <button class="avatar-btn" aria-label="Open profile">
        <img
            class="avatar"
            :src="avatarUrl"
            alt=""
            loading="lazy"
        />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"

defineProps<{
  title: string
}>()

defineEmits<{
  (e: "open-mobile"): void
}>()

const avatarUrl = computed(
    () => "https://api.dicebear.com/9.x/initials/svg?seed=User"
)

/* Notifications demo state */
const isNotifOpen = ref(false)

type Notif = {
  id: string
  title: string
  meta: string
  read?: boolean
}

const notifications = ref<Notif[]>([
  { id: "1", title: "Timesheet approved", meta: "2 hours ago" },
  { id: "2", title: "Reminder: submit timesheet", meta: "Yesterday" }
])

const notifCount = computed(
    () => notifications.value.filter(n => !n.read).length
)

function toggleNotif() {
  isNotifOpen.value = !isNotifOpen.value
}

function markAllRead() {
  notifications.value.forEach(n => (n.read = true))
}
</script>

<style scoped>
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

.topbar__actions {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

/* icon buttons */
.icon-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 8px;
  border-radius: var(--r-sm);
  position: relative;
}

.icon-btn:hover {
  background: var(--surface-2);
}

/* hide hamburger on big screens */
@media (min-width: 961px) {
  .hamburger {
    display: none;
  }
}

/* badge */
.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--danger);
  color: white;
  border-radius: var(--r-pill);
  font-size: 11px;
  padding: 0 6px;
  line-height: 16px;
}

/* avatar */
.avatar-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: var(--r-pill);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: block;
}

/* notifications dropdown */
.menu {
  position: relative;
}

.menu__card {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 300px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-md);
  z-index: 20;
}

.menu__header {
  display: flex;
  justify-content: space-between;
  padding: var(--s-3);
  border-bottom: 1px solid var(--border);
}

.menu__empty {
  padding: var(--s-4);
  color: var(--text-2);
}

.menu__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.menu__item {
  padding: var(--s-3);
  border-bottom: 1px solid var(--border);
}

.menu__item:last-child {
  border-bottom: none;
}

.menu__item-title {
  font-weight: 600;
}

.menu__item-meta {
  font-size: 13px;
  color: var(--text-3);
}

.link-btn {
  border: none;
  background: none;
  color: var(--primary);
  cursor: pointer;
}
</style>
