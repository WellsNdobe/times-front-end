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
      <div class="menu" ref="menuRef">
        <button
            class="icon-btn"
            type="button"
            aria-label="Notifications"
            @click="toggleNotif"
        >
          <Icon
              :name="notifCount ? 'mdi:bell-ring-outline' : 'mdi:bell-outline'"
              size="22"
              class="notif-bell"
              :class="{ 'notif-bell--active': notifCount }"
          />
          <span v-if="notifCount" class="badge">{{ notifCount }}</span>
        </button>

        <div v-if="isNotifOpen" class="menu__card">
          <div class="menu__header">
            <strong>Notifications</strong>
            <button class="link-btn" :disabled="notifCount === 0" @click="markAllRead">
              Mark all read
            </button>
          </div>

          <div v-if="notifications.length === 0" class="menu__empty">
            You're all caught up. Check back later.
          </div>

          <ul v-else class="menu__list">
            <li
                v-for="n in notifications"
                :key="n.id"
                class="menu__item"
                :class="{ 'menu__item--unread': !n.read }"
            >
              <div class="menu__item-icon" :class="`menu__item-icon--${n.tone}`">
                <Icon :name="n.icon" size="18" />
              </div>
              <div class="menu__item-body">
                <div class="menu__item-title">
                  <span class="menu__item-title-text">{{ n.title }}</span>
                  <span v-if="!n.read" class="pill">New</span>
                </div>
                <div class="menu__item-desc">{{ n.desc }}</div>
                <div class="menu__item-meta">{{ n.meta }}</div>
              </div>
            </li>
          </ul>

          <div class="menu__footer">
            <button class="link-btn" type="button">View all notifications</button>
          </div>
        </div>
      </div>

      <!-- Avatar -->
      <button class="avatar-btn" aria-label="Open profile">
        <span class="user-chip">
          <span class="user-name">{{ user.name }}</span>
          <span class="user-role">{{ user.role }}</span>
        </span>
        <img
            class="avatar"
            :src="avatarUrl"
            :alt="`${user.name} avatar`"
            loading="lazy"
        />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue"

defineProps<{
  title: string
}>()

defineEmits<{
  (e: "open-mobile"): void
}>()

const user = {
  name: "Amara Dlamini",
  role: "Project Lead"
}

const avatarUrl = computed(
    () =>
        `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
            user.name
        )}`
)

/* Notifications demo state */
const isNotifOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

type Notif = {
  id: string
  title: string
  desc: string
  meta: string
  icon: string
  tone: "success" | "warning" | "info"
  read?: boolean
}

const notifications = ref<Notif[]>([
  {
    id: "1",
    title: "Timesheet approved",
    desc: "Nice work! Your Jan 29 entry was approved.",
    meta: "2 hours ago",
    icon: "mdi:check-circle-outline",
    tone: "success",
    read: false
  },
  {
    id: "2",
    title: "Reminder: submit timesheet",
    desc: "Friday is close. Log hours to avoid delays.",
    meta: "Yesterday",
    icon: "mdi:clock-outline",
    tone: "warning",
    read: false
  },
  {
    id: "3",
    title: "New comment on Project Atlas",
    desc: "Thabo: “Looks good. Let’s ship this.”",
    meta: "Jan 29",
    icon: "mdi:message-text-outline",
    tone: "info",
    read: true
  }
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

function handleDocClick(event: MouseEvent) {
  if (!isNotifOpen.value) return
  const target = event.target as Node | null
  if (menuRef.value && target && !menuRef.value.contains(target)) {
    isNotifOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener("mousedown", handleDocClick)
})

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleDocClick)
})
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

.notif-bell--active {
  animation: bell-ring 1.2s ease-in-out infinite;
}

@keyframes bell-ring {
  0% { transform: rotate(0deg); }
  10% { transform: rotate(12deg); }
  20% { transform: rotate(-10deg); }
  30% { transform: rotate(8deg); }
  40% { transform: rotate(-6deg); }
  50% { transform: rotate(4deg); }
  60% { transform: rotate(0deg); }
  100% { transform: rotate(0deg); }
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
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: block;
  border: 1px solid var(--border);
}

.user-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.1;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.user-role {
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .user-chip {
    display: none;
  }
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
  align-items: center;
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
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: var(--s-3);
  align-items: flex-start;
}

.menu__item:last-child {
  border-bottom: none;
}

.menu__item--unread {
  background: linear-gradient(90deg, rgba(63, 133, 255, 0.08), transparent);
}

.menu__item-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.menu__item-icon--success {
  background: #27ae60;
}

.menu__item-icon--warning {
  background: #f39c12;
}

.menu__item-icon--info {
  background: #2d9cdb;
}

.menu__item-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu__item-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.menu__item-title-text {
  color: var(--text-1);
}

.menu__item-desc {
  font-size: 13px;
  color: var(--text-2);
}

.menu__item-meta {
  font-size: 13px;
  color: var(--text-3);
}

.menu__footer {
  padding: var(--s-2) var(--s-3);
  border-top: 1px solid var(--border);
  text-align: center;
}

.pill {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--r-pill);
  background: var(--primary);
  color: white;
}

.link-btn {
  border: none;
  background: none;
  color: var(--primary);
  cursor: pointer;
}

.link-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
