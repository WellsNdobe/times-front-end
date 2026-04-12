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
import { ref, computed, onMounted } from "vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi } from "~/api/organizationsApi"

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
const organizationId = ref<string | null>(null)

onMounted(() => {
  void loadUserName()
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

async function ensureOrganizationId() {
  if (organizationId.value) return organizationId.value
  const orgs = await organizationsApi.getMine()
  const orgId = orgs?.[0]?.id ?? null
  organizationId.value = orgId
  return orgId
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
/* hide hamburger on big screens */
@media (min-width: 961px) {
  .hamburger {
    display: none;
  }
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

</style>
