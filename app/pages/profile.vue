<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref } from "vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

type WeekStartDay = "monday" | "sunday"
type ReminderDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

const { user, logout } = useAuth()

const org = ref<Organization | null>(null)
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const clients = ref<Client[]>([])
const myMember = ref<OrganizationMember | null>(null)
const loading = ref(true)
const error = ref<UiError | null>(null)

const saveMessage = ref("")
const securityMessage = ref("")
const securityError = ref("")
const passwordLoading = ref(false)
const signOutAllLoading = ref(false)
const showPasswordForm = ref(false)
const openSections = ref({
  defaults: true,
  workflow: false,
  security: false,
  org: false,
})

const passwordForm = ref({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
})

const personalPrefs = ref({
  weeklyHoursTarget: 40,
  weekStartDay: "monday" as WeekStartDay,
  defaultProjectId: "",
  defaultClientId: "",
  timeZone: "UTC",
})

const workflowPrefs = ref({
  managerId: "",
  backupApproverId: "",
  autoReminders: true,
  reminderDay: "friday" as ReminderDay,
  reminderTime: "09:00",
})

const orgPrefs = ref({
  weekStartDay: "monday" as WeekStartDay,
  weeklyHoursTarget: 40,
})

const timeZones = [
  "UTC",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
]

const reminderDayOptions: Array<{ value: ReminderDay; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
]

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

const isAdmin = computed(() => myMember.value?.role === 0)
const memberStatus = computed(() => (myMember.value?.isActive ? "Active" : "Inactive"))
const profileUserId = computed(() => user.value?.userId ?? "-")
const orgName = computed(() => org.value?.name ?? "-")
const teamSize = computed(() => members.value.length)
const memberSince = computed(() => {
  const created = myMember.value?.createdAtUtc
  if (!created) return "-"
  const date = new Date(created)
  if (Number.isNaN(date.getTime())) return created
  return date.toLocaleDateString()
})

const approverCandidates = computed(() =>
  members.value.filter((member) => member.isActive && member.userId !== user.value?.userId)
)

onMounted(() => loadProfile())

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
    myMember.value = userId ? membersResult.find((m) => m.userId === userId) ?? null : null

    hydrateSettingsFromStorage()
  } catch (e) {
    console.error("Load profile error:", e)
    error.value = toUiError(e)
  } finally {
    loading.value = false
  }
}

function roleLabelByValue(role?: number) {
  if (role === 0) return "Admin"
  if (role === 1) return "Manager"
  if (role === 2) return "Employee"
  return "-"
}

function memberDisplayName(member: OrganizationMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
  return name || "Unknown user"
}

function storageKey(kind: "personal" | "workflow" | "org") {
  const orgId = org.value?.id ?? "no-org"
  const userId = user.value?.userId ?? "no-user"
  return `timesheet.profile.${kind}.${orgId}.${userId}`
}

function hydrateSettingsFromStorage() {
  if (typeof localStorage === "undefined") return
  try {
    const savedPersonal = localStorage.getItem(storageKey("personal"))
    if (savedPersonal) {
      personalPrefs.value = { ...personalPrefs.value, ...JSON.parse(savedPersonal) }
    }

    const savedWorkflow = localStorage.getItem(storageKey("workflow"))
    if (savedWorkflow) {
      workflowPrefs.value = { ...workflowPrefs.value, ...JSON.parse(savedWorkflow) }
    }

    const savedOrg = localStorage.getItem(storageKey("org"))
    if (savedOrg) {
      orgPrefs.value = { ...orgPrefs.value, ...JSON.parse(savedOrg) }
    }
  } catch (e) {
    console.error("Could not read saved profile settings:", e)
  }
}

function savePersonalPreferences() {
  saveMessage.value = ""
  if (typeof localStorage === "undefined") return
  localStorage.setItem(storageKey("personal"), JSON.stringify(personalPrefs.value))
  saveMessage.value = "Personal preferences saved locally."
}

function saveWorkflowPreferences() {
  saveMessage.value = ""
  if (typeof localStorage === "undefined") return
  localStorage.setItem(storageKey("workflow"), JSON.stringify(workflowPrefs.value))
  saveMessage.value = "Workflow preferences saved locally."
}

function saveOrganizationPreferences() {
  if (!isAdmin.value) return
  saveMessage.value = ""
  if (typeof localStorage === "undefined") return
  localStorage.setItem(storageKey("org"), JSON.stringify(orgPrefs.value))
  saveMessage.value = "Organization preferences saved locally."
}

async function onChangePassword() {
  securityError.value = ""
  securityMessage.value = ""

  if (!passwordForm.value.currentPassword || !passwordForm.value.newPassword) {
    securityError.value = "Current and new password are required."
    return
  }
  if (passwordForm.value.newPassword.length < 8) {
    securityError.value = "New password must be at least 8 characters."
    return
  }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    securityError.value = "New password and confirmation do not match."
    return
  }

  passwordLoading.value = true
  try {
    // UI exists now; backend endpoint is pending.
    await new Promise((resolve) => setTimeout(resolve, 400))
    securityMessage.value = "Password change UI is ready. Backend endpoint is not connected yet."
    passwordForm.value.currentPassword = ""
    passwordForm.value.newPassword = ""
    passwordForm.value.confirmPassword = ""
    showPasswordForm.value = false
  } finally {
    passwordLoading.value = false
  }
}

function togglePasswordForm() {
  showPasswordForm.value = !showPasswordForm.value
  securityError.value = ""
  if (!showPasswordForm.value) {
    passwordForm.value.currentPassword = ""
    passwordForm.value.newPassword = ""
    passwordForm.value.confirmPassword = ""
  }
}

async function onSignOutAll() {
  securityError.value = ""
  securityMessage.value = ""
  signOutAllLoading.value = true
  try {
    // Keep action explicit until a dedicated backend revoke-all endpoint is available.
    await new Promise((resolve) => setTimeout(resolve, 300))
    securityMessage.value =
      "Sign out all sessions is not connected to backend yet. Use Logout for the current session."
  } finally {
    signOutAllLoading.value = false
  }
}

async function onLogoutCurrent() {
  await logout()
}

function toggleSection(section: keyof typeof openSections.value) {
  const isOpening = !openSections.value[section]
  openSections.value.defaults = false
  openSections.value.workflow = false
  openSections.value.security = false
  openSections.value.org = false
  if (isOpening) {
    openSections.value[section] = true
  }
}
</script>

<template>
  <section class="profile">
    <header class="card profile__hero">
      <div>
        <h1 class="profile__title">My Profile</h1>
        <p class="profile__subtitle">Identity, preferences, approvals, and security.</p>
      </div>
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
              <strong>{{ roleLabelByValue(myMember?.role) }}</strong>
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
      </section>

      <section class="profile__sections">
        <article class="card profile__section">
          <button type="button" class="profile__section-header" @click="toggleSection('defaults')">
            <span>Default settings</span>
            <span class="profile__chevron" :class="{ 'profile__chevron--open': openSections.defaults }" aria-hidden="true">▼</span>
          </button>
          <div v-if="openSections.defaults" class="profile__section-body">
            <label class="profile__field">
              <span class="profile__label">Default weekly hours target</span>
              <input v-model.number="personalPrefs.weeklyHoursTarget" type="number" min="1" max="168" />
            </label>
            <label class="profile__field">
              <span class="profile__label">Preferred week start</span>
              <select v-model="personalPrefs.weekStartDay">
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </select>
            </label>
            <label class="profile__field">
              <span class="profile__label">Default client (optional)</span>
              <select v-model="personalPrefs.defaultClientId">
                <option value="">None</option>
                <option v-for="client in clients" :key="client.id" :value="client.id">
                  {{ client.name }}
                </option>
              </select>
            </label>
            <label class="profile__field">
              <span class="profile__label">Default project (optional)</span>
              <select v-model="personalPrefs.defaultProjectId">
                <option value="">None</option>
                <option v-for="project in projects" :key="project.id" :value="project.id">
                  {{ project.name }}
                </option>
              </select>
            </label>
            <label class="profile__field">
              <span class="profile__label">Time zone</span>
              <select v-model="personalPrefs.timeZone">
                <option v-for="zone in timeZones" :key="zone" :value="zone">{{ zone }}</option>
              </select>
            </label>
            <button type="button" class="btn btn-primary" @click="savePersonalPreferences">
              Save defaults
            </button>
          </div>
        </article>

        <article class="card profile__section">
          <button type="button" class="profile__section-header" @click="toggleSection('workflow')">
            <span>Approvals and workflow</span>
            <span class="profile__chevron" :class="{ 'profile__chevron--open': openSections.workflow }" aria-hidden="true">▼</span>
          </button>
          <div v-if="openSections.workflow" class="profile__section-body">
            <label class="profile__field">
              <span class="profile__label">Manager / approver</span>
              <select v-model="workflowPrefs.managerId">
                <option value="">Not set</option>
                <option v-for="member in approverCandidates" :key="member.id" :value="member.id">
                  {{ memberDisplayName(member) }}
                </option>
              </select>
            </label>
            <label class="profile__field">
              <span class="profile__label">Backup approver</span>
              <select v-model="workflowPrefs.backupApproverId">
                <option value="">Not set</option>
                <option v-for="member in approverCandidates" :key="member.id" :value="member.id">
                  {{ memberDisplayName(member) }}
                </option>
              </select>
            </label>
            <label class="profile__field profile__toggle">
              <input v-model="workflowPrefs.autoReminders" type="checkbox" />
              <span>Auto-reminders enabled</span>
            </label>
            <label class="profile__field">
              <span class="profile__label">Reminder day</span>
              <select v-model="workflowPrefs.reminderDay" :disabled="!workflowPrefs.autoReminders">
                <option v-for="day in reminderDayOptions" :key="day.value" :value="day.value">
                  {{ day.label }}
                </option>
              </select>
            </label>
            <label class="profile__field">
              <span class="profile__label">Reminder time</span>
              <input v-model="workflowPrefs.reminderTime" type="time" :disabled="!workflowPrefs.autoReminders" />
            </label>
            <button type="button" class="btn btn-primary" @click="saveWorkflowPreferences">
              Save workflow
            </button>
          </div>
        </article>

        <article class="card profile__section">
          <button type="button" class="profile__section-header" @click="toggleSection('security')">
            <span>Security</span>
            <span class="profile__chevron" :class="{ 'profile__chevron--open': openSections.security }" aria-hidden="true">▼</span>
          </button>
          <div v-if="openSections.security" class="profile__section-body">
            <div class="profile__actions">
              <button type="button" class="btn btn-primary" @click="togglePasswordForm">
                {{ showPasswordForm ? "Cancel password change" : "Change password" }}
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="signOutAllLoading"
                @click="onSignOutAll"
              >
                {{ signOutAllLoading ? "Submitting..." : "Sign out all sessions" }}
              </button>
              <button type="button" class="btn btn-secondary" @click="onLogoutCurrent">
                Logout current session
              </button>
            </div>

            <template v-if="showPasswordForm">
              <label class="profile__field">
                <span class="profile__label">Current password</span>
                <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" />
              </label>
              <label class="profile__field">
                <span class="profile__label">New password</span>
                <input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" />
              </label>
              <label class="profile__field">
                <span class="profile__label">Confirm new password</span>
                <input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" />
              </label>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="passwordLoading"
                @click="onChangePassword"
              >
                {{ passwordLoading ? "Submitting..." : "Submit password change" }}
              </button>
            </template>

            <p class="profile__hint">This project uses local auth with email/password and JWT sessions.</p>
            <p v-if="securityError" class="profile__error">{{ securityError }}</p>
            <p v-if="securityMessage" class="profile__hint">{{ securityMessage }}</p>
          </div>
        </article>

        <article v-if="isAdmin" class="card profile__section">
          <button type="button" class="profile__section-header" @click="toggleSection('org')">
            <span>Organization preferences</span>
            <span class="profile__chevron" :class="{ 'profile__chevron--open': openSections.org }" aria-hidden="true">▼</span>
          </button>
          <div v-if="openSections.org" class="profile__section-body">
            <div class="profile__kv">
              <span>Organization</span>
              <strong>{{ orgName }}</strong>
            </div>
            <div class="profile__kv">
              <span>Team size</span>
              <strong>{{ teamSize }}</strong>
            </div>
            <label class="profile__field">
              <span class="profile__label">Week start day (organization)</span>
              <select v-model="orgPrefs.weekStartDay">
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </select>
            </label>
            <label class="profile__field">
              <span class="profile__label">Target weekly hours (organization)</span>
              <input v-model.number="orgPrefs.weeklyHoursTarget" type="number" min="1" max="168" />
            </label>
            <button type="button" class="btn btn-primary" @click="saveOrganizationPreferences">
              Save organization preferences
            </button>
            <p class="profile__hint">Admin-only settings. Stored locally until backend support is added.</p>
          </div>
        </article>
      </section>

      <p v-if="saveMessage" class="profile__saved">{{ saveMessage }}</p>
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

.profile__sections {
  display: grid;
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

.profile__id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.95rem;
}

.profile__label {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  font-weight: 700;
}

.profile__section {
  padding: 0;
}

.profile__section-header {
  width: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: var(--s-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-1);
  border-bottom: 1px solid var(--border);
}

.profile__section-body {
  padding: var(--s-4);
  display: grid;
  gap: var(--s-3);
}

.profile__chevron {
  color: var(--text-2);
  opacity: 0.95;
  font-size: 12px;
  line-height: 1;
  transition: transform 0.2s ease;
}

.profile__chevron--open {
  transform: rotate(180deg);
}

.profile__field {
  display: grid;
  gap: var(--s-1);
}

.profile__toggle {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--s-2);
}

.profile__kv {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  font-size: 0.95rem;
}

.profile__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.profile__hint {
  margin: 0;
  color: var(--text-2);
  font-size: 0.85rem;
}

.profile__error {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
}

.profile__saved {
  margin: 0;
  color: var(--text-2);
}

.profile__loading {
  padding: var(--s-4);
}

.muted {
  margin: 0;
  color: var(--text-2);
}

@media (max-width: 1100px) {
}

@media (max-width: 900px) {
  .profile__summary-row {
    grid-template-columns: 1fr;
  }
}
</style>
