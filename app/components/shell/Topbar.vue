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
      <!-- Notifications (bell always visible; badge only when unread) -->
      <div class="menu" ref="menuRef">
        <button
            class="icon-btn icon-btn--notif"
            type="button"
            aria-label="Notifications"
            @click="toggleNotif"
        >
          <Icon
              name="mdi:bell-outline"
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

          <div v-if="uiNotifications.length === 0" class="menu__empty">
            You're all caught up. Check back later.
          </div>

          <ul v-else class="menu__list">
            <li
                v-for="n in uiNotifications"
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
            <NuxtLink class="link-btn" to="/notifications" @click="isNotifOpen = false">
              View all notifications
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Avatar -->
      <button class="avatar-btn" :aria-label="`Open profile for ${userName} (${userRole})`">
        <span class="user-chip">
          <span class="user-name">{{ userName }}</span>
        </span>
        <img
            class="avatar"
            :src="avatarUrl"
            :alt="`${userName} avatar`"
            loading="lazy"
        />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi } from "~/api/organizationsApi"
import { notificationsApi, type Notification as ApiNotification } from "~/api/notificationsApi"

defineProps<{
  title: string
}>()

defineEmits<{
  (e: "open-mobile"): void
}>()

const { user } = useAuth()
const userRole = "Project Lead"
const resolvedUserName = ref<string | null>(null)
const userName = computed(() => {
  if (resolvedUserName.value) return resolvedUserName.value
  return "Unknown User"
})

const avatarUrl = computed(
    () =>
        `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
            userName.value
        )}`
)

/* Notifications */
const isNotifOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const organizationId = ref<string | null>(null)

type UiNotif = {
  id: string
  title: string
  desc: string
  meta: string
  icon: string
  tone: "success" | "warning" | "info"
  read?: boolean
}

const notifications = ref<ApiNotification[]>([])

const uiNotifications = computed<UiNotif[]>(() =>
  notifications.value.map((n) => {
    const ui = mapNotification(n.type)
    return {
      id: n.id,
      title: n.title,
      desc: n.message,
      meta: formatRelativeTime(n.createdAtUtc),
      icon: ui.icon,
      tone: ui.tone,
      read: n.isRead
    }
  })
)

const notifCount = computed(
    () => notifications.value.filter(n => !n.isRead).length
)

function toggleNotif() {
  isNotifOpen.value = !isNotifOpen.value
  if (isNotifOpen.value) {
    void loadNotifications()
  }
}

async function markAllRead() {
  const orgId = await ensureOrganizationId()
  if (!orgId) return
  try {
    await notificationsApi.markAllRead(orgId)
    notifications.value = []
  } catch (error) {
    console.error("Failed to mark notifications read:", error)
  }
}

function handleDocClick(event: MouseEvent) {
  if (!isNotifOpen.value) return
  const target = event.target as Node | null
  if (menuRef.value && target && !menuRef.value.contains(target)) {
    isNotifOpen.value = false
  }
}

onMounted(() => {
  loadUserName()
  loadNotifications()
  document.addEventListener("mousedown", handleDocClick)
})

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleDocClick)
})

async function loadUserName() {
  if (!user.value?.userId) return
  try {
    const orgId = await ensureOrganizationId()
    if (!orgId) return
    const members = await organizationsApi.getMembers(orgId)
    const me = members.find((member) => member.userId === user.value?.userId)
    if (!me) return
    const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim()
    if (fullName) resolvedUserName.value = fullName
  } catch (error) {
    console.error("Failed to load user display name:", error)
  }
}

async function loadNotifications() {
  const orgId = await ensureOrganizationId()
  if (!orgId) return
  try {
    await notificationsApi.createReminder(orgId)
    notifications.value = await notificationsApi.list(orgId, { unreadOnly: true, take: 25 })
  } catch (error) {
    console.error("Failed to load notifications:", error)
  }
}

async function ensureOrganizationId() {
  if (organizationId.value) return organizationId.value
  const orgs = await organizationsApi.getMine()
  const orgId = orgs?.[0]?.id ?? null
  organizationId.value = orgId
  return orgId
}

function mapNotification(type: number) {
  switch (type) {
    case 1:
      return { icon: "mdi:send-outline", tone: "info" as const }
    case 2:
      return { icon: "mdi:check-circle-outline", tone: "success" as const }
    case 3:
      return { icon: "mdi:close-circle-outline", tone: "warning" as const }
    case 4:
      return { icon: "mdi:clock-outline", tone: "warning" as const }
    default:
      return { icon: "mdi:bell-outline", tone: "info" as const }
  }
}

function formatRelativeTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

  if (abs < 60) return rtf.format(diffSec, "second")
  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute")
  const diffHour = Math.round(diffMin / 60)
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour")
  const diffDay = Math.round(diffHour / 24)
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, "day")
  return date.toLocaleDateString()
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

/* Notifications button: always visible, never collapses when badge is hidden */
.icon-btn--notif {
  min-width: 38px;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  width: min(280px, calc(100vw - 24px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-md);
  z-index: 20;
  display: flex;
  flex-direction: column;
  max-height: min(60vh, 420px);
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
  overflow-y: auto;
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
