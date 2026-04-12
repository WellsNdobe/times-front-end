<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref } from "vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const { user, logout } = useAuth()

const org = ref<Organization | null>(null)
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const clients = ref<Client[]>([])
const myMember = ref<OrganizationMember | null>(null)
const loading = ref(true)
const error = ref<UiError | null>(null)

const displayName = computed(() => {
  const member = myMember.value
  const name = [member?.firstName, member?.lastName].filter(Boolean).join(" ").trim()
  if (name) return name
  const email = user.value?.email ?? ""
  if (email.includes("@")) return email.split("@")[0]
  return "Unknown User"
})

const avatarUrl = computed(
  () => `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName.value)}`
)

const profileUserId = computed(() => user.value?.userId ?? "-")
const orgName = computed(() => org.value?.name ?? "-")
const roleLabel = computed(() => {
  const role = myMember.value?.role
  if (role === 0) return "Admin"
  if (role === 1) return "Manager"
  if (role === 2) return "Employee"
  return "-"
})
const memberStatus = computed(() => (myMember.value?.isActive ? "Active" : "Inactive"))
const memberSince = computed(() => {
  const created = myMember.value?.createdAtUtc
  if (!created) return "-"
  const date = new Date(created)
  if (Number.isNaN(date.getTime())) return created
  return date.toLocaleDateString()
})
const activeTeamSize = computed(() => members.value.filter((member) => member.isActive).length)
const activeProjectsCount = computed(() => projects.value.filter((project) => project.isActive !== false).length)
const activeClientsCount = computed(() => clients.value.filter((client) => client.isActive !== false).length)

onMounted(() => {
  void loadProfile()
})

async function loadProfile() {
  loading.value = true
  error.value = null
  try {
    const orgs = await organizationsApi.getMine()
    if (!orgs?.length) {
      error.value = { title: "No organization", message: "Create an organization first." }
      return
    }

    const firstOrg = orgs[0]
    if (!firstOrg) return
    org.value = firstOrg

    const [membersResult, projectsResult, clientsResult] = await Promise.all([
      organizationsApi.getMembers(firstOrg.id),
      projectsApi.list(firstOrg.id),
      clientsApi.list(firstOrg.id),
    ])

    members.value = membersResult
    projects.value = projectsResult
    clients.value = clientsResult

    const userId = user.value?.userId
    myMember.value = userId ? membersResult.find((member) => member.userId === userId) ?? null : null
  } catch (e) {
    console.error("Load profile error:", e)
    error.value = toUiError(e)
  } finally {
    loading.value = false
  }
}

async function onLogoutCurrent() {
  await logout()
}
</script>

<template>
  <section class="profile">
    <header class="card profile__hero">
      <div>
        <h1 class="profile__title">My Profile</h1>
        <p class="profile__subtitle">Account and organization details from the current backend.</p>
      </div>
      <button type="button" class="btn btn-secondary" @click="onLogoutCurrent">
        Logout
      </button>
    </header>

    <div v-if="error" class="alert" role="alert">
      <div class="alert__title">{{ error.title }}</div>
      <div class="alert__msg">{{ error.message }}</div>
    </div>

    <template v-else-if="loading">
      <section class="card profile__loading">
        <p class="muted">Loading profile...</p>
      </section>
    </template>

    <template v-else>
      <section class="profile__grid">
        <article class="card profile__summary">
          <div class="profile__summary-main">
            <img class="profile__avatar" :src="avatarUrl" :alt="`${displayName} avatar`" />
            <div>
              <h2 class="profile__name">{{ displayName }}</h2>
              <p class="profile__meta">{{ user?.email || "-" }}</p>
            </div>
          </div>

          <div class="profile__summary-row">
            <div>
              <span class="profile__label">Role</span>
              <strong>{{ roleLabel }}</strong>
            </div>
            <div>
              <span class="profile__label">Status</span>
              <strong>{{ memberStatus }}</strong>
            </div>
            <div>
              <span class="profile__label">Member since</span>
              <strong>{{ memberSince }}</strong>
            </div>
            <div>
              <span class="profile__label">Profile ID</span>
              <strong class="profile__id">{{ profileUserId }}</strong>
            </div>
          </div>
        </article>

        <article class="card profile__card">
          <h3 class="profile__card-title">Organization</h3>
          <div class="profile__kv">
            <span>Name</span>
            <strong>{{ orgName }}</strong>
          </div>
          <div class="profile__kv">
            <span>Active team members</span>
            <strong>{{ activeTeamSize }}</strong>
          </div>
          <div class="profile__kv">
            <span>Active projects</span>
            <strong>{{ activeProjectsCount }}</strong>
          </div>
          <div class="profile__kv">
            <span>Active clients</span>
            <strong>{{ activeClientsCount }}</strong>
          </div>
        </article>

        <article class="card profile__card">
          <h3 class="profile__card-title">Auth Status</h3>
          <div class="profile__kv">
            <span>Signed in email</span>
            <strong>{{ user?.email || "-" }}</strong>
          </div>
          <div class="profile__kv">
            <span>User ID</span>
            <strong class="profile__id">{{ profileUserId }}</strong>
          </div>
          <p class="profile__hint">
            Unsupported preference, password-change, and organization-settings actions have been removed until matching backend endpoints exist.
          </p>
        </article>
      </section>
    </template>
  </section>
</template>

<style scoped>
.profile {
  display: grid;
  gap: var(--s-4);
}

.profile__hero {
  padding: var(--s-5);
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--s-3);
}

.profile__title {
  margin: 0;
  font-size: 1.5rem;
}

.profile__subtitle {
  margin: var(--s-1) 0 0 0;
  color: var(--text-2);
}

.profile__grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--s-3);
}

.profile__summary {
  grid-column: span 12;
  padding: var(--s-5);
  display: grid;
  gap: var(--s-4);
}

.profile__summary-main {
  display: flex;
  gap: var(--s-4);
  align-items: center;
}

.profile__avatar {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: var(--surface-2);
}

.profile__name {
  margin: 0 0 var(--s-1) 0;
  font-size: 1.25rem;
}

.profile__meta {
  margin: 0;
  color: var(--text-2);
}

.profile__summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-3);
}

.profile__card {
  grid-column: span 6;
  padding: var(--s-4);
  display: grid;
  gap: var(--s-3);
}

.profile__card-title {
  margin: 0;
  font-size: 1rem;
}

.profile__label {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  font-weight: 700;
}

.profile__kv {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  font-size: 0.95rem;
}

.profile__id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.95rem;
}

.profile__hint {
  margin: 0;
  color: var(--text-2);
  font-size: 0.85rem;
}

.profile__loading {
  padding: var(--s-4);
}

.muted {
  margin: 0;
  color: var(--text-2);
}

@media (max-width: 900px) {
  .profile__hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .profile__summary-row,
  .profile__card {
    grid-column: span 12;
  }

  .profile__summary-row {
    grid-template-columns: 1fr;
  }
}
</style>
