<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

import { ref, computed, onMounted } from "vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import {
    projectsApi,
    type Project,
    type CreateProjectRequest,
    type UpdateProjectRequest,
    type ProjectAssignment,
} from "~/api/projectsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const { user } = useAuth()

const org = ref<Organization | null>(null)
const clients = ref<Client[]>([])
const projects = ref<Project[]>([])
const members = ref<OrganizationMember[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)

const filterActive = ref<boolean | "all">("all")

const addForm = ref({ name: "", clientId: "", isActive: true })
const addLoading = ref(false)
const addError = ref<UiError | null>(null)
const showAddForm = ref(false)

const editingProjectId = ref<string | null>(null)
const editForm = ref<{ name: string; clientId: string; isActive: boolean }>({
    name: "",
    clientId: "",
    isActive: true,
})
const updateLoading = ref(false)
const updateError = ref<UiError | null>(null)

const organizationId = computed(() => org.value?.id ?? "")

const memberMap = computed(() => {
    const map = new Map<string, OrganizationMember>()
    for (const m of members.value) map.set(m.userId, m)
    return map
})

const myMember = computed(() => {
    const userId = user.value?.userId
    if (!userId) return null
    return members.value.find((m) => m.userId === userId) ?? null
})

const isManagerOrAdmin = computed(() => {
    const role = myMember.value?.role
    return role === 0 || role === 1
})

const listParams = computed(() => {
    if (filterActive.value === "all") return undefined
    return { isActive: filterActive.value }
})

async function loadProjects() {
    error.value = null
    loading.value = true
    try {
        const orgs = await organizationsApi.getMine()
        if (!orgs?.length) {
            error.value = { title: "No organization", message: "Create an organization first." }
            return
        }
        const firstOrg = orgs[0]
        if (!firstOrg) return
        org.value = firstOrg
        if (org.value?.id) {
            const [projectsResult, clientsResult, membersResult] = await Promise.all([
                projectsApi.list(org.value.id, listParams.value),
                clientsApi.list(org.value.id),
                organizationsApi.getMembers(org.value.id),
            ])
            projects.value = projectsResult
            clients.value = clientsResult
            members.value = membersResult
        }
    } catch (e) {
        console.error("Load projects error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

onMounted(() => loadProjects())

async function onFilterChange() {
    if (!organizationId.value) return
    openAssignmentsProjectId.value = null
    loading.value = true
    error.value = null
    try {
        projects.value = await projectsApi.list(organizationId.value, listParams.value)
    } catch (e) {
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

async function onAddProject() {
    addError.value = null
    addLoading.value = true
    try {
        const payload: CreateProjectRequest = {
            name: addForm.value.name.trim(),
            clientId: addForm.value.clientId || undefined,
            isActive: addForm.value.isActive,
        }
        await projectsApi.create(organizationId.value, payload)
        await loadProjects()
        addForm.value = { name: "", clientId: "", isActive: true }
        showAddForm.value = false
    } catch (e) {
        console.error("Create project error:", e)
        addError.value = toUiError(e)
    } finally {
        addLoading.value = false
    }
}

function startEdit(project: Project) {
    editingProjectId.value = project.id
    editForm.value = {
        name: (project.name as string) ?? "",
        clientId: (project.clientId as string) ?? "",
        isActive: project.isActive !== false,
    }
    updateError.value = null
}

function cancelEdit() {
    editingProjectId.value = null
    updateError.value = null
}

async function onUpdateProject() {
    if (!editingProjectId.value) return
    updateError.value = null
    updateLoading.value = true
    try {
        const payload: UpdateProjectRequest = {
            name: editForm.value.name.trim() || undefined,
            clientId: editForm.value.clientId || undefined,
            isActive: editForm.value.isActive,
        }
        await projectsApi.update(organizationId.value, editingProjectId.value, payload)
        await loadProjects()
        editingProjectId.value = null
    } catch (e) {
        console.error("Update project error:", e)
        updateError.value = toUiError(e)
    } finally {
        updateLoading.value = false
    }
}

function clientName(project: Project) {
    if (project.clientName) return project.clientName
    if (!project.clientId) return "Unassigned"
    const client = clients.value.find((c) => c.id === project.clientId)
    return client?.name ?? "Unassigned"
}

const openAssignmentsProjectId = ref<string | null>(null)
const assignments = ref<ProjectAssignment[]>([])
const assignmentsLoading = ref(false)
const assignmentsError = ref<UiError | null>(null)

const assignUserId = ref("")
const assignLoading = ref(false)
const assignError = ref<UiError | null>(null)
const unassignLoadingUserId = ref<string | null>(null)

function memberDisplayNameByUserId(userId?: string) {
    if (!userId) return "Unknown member"
    const member = memberMap.value.get(userId)
    if (!member) return userId
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
    return name || member.userId
}

const assignedUserIds = computed(() => new Set(assignments.value.map((a) => a.userId)))
const assignCandidates = computed(() =>
    members.value
        .filter((m) => m.isActive)
        .filter((m) => !assignedUserIds.value.has(m.userId))
        .sort((a, b) =>
            memberDisplayNameByUserId(a.userId).localeCompare(memberDisplayNameByUserId(b.userId))
        )
)

async function loadAssignments(projectId: string) {
    if (!organizationId.value) return
    assignmentsLoading.value = true
    assignmentsError.value = null
    try {
        assignments.value = await projectsApi.getAssignments(organizationId.value, projectId)
    } catch (e) {
        console.error("Load assignments error:", e)
        assignmentsError.value = toUiError(e)
    } finally {
        assignmentsLoading.value = false
    }
}

async function toggleAssignments(projectId: string) {
    assignError.value = null
    assignmentsError.value = null
    if (openAssignmentsProjectId.value === projectId) {
        openAssignmentsProjectId.value = null
        return
    }
    openAssignmentsProjectId.value = projectId
    assignUserId.value = ""
    await loadAssignments(projectId)
}

async function onAssignUser() {
    if (!organizationId.value || !openAssignmentsProjectId.value) return
    assignError.value = null
    const userId = assignUserId.value?.trim()
    if (!userId) {
        assignError.value = { title: "User required", message: "Select a team member to assign." }
        return
    }
    assignLoading.value = true
    try {
        await projectsApi.assignUser(organizationId.value, openAssignmentsProjectId.value, { userId })
        assignUserId.value = ""
        await loadAssignments(openAssignmentsProjectId.value)
    } catch (e) {
        console.error("Assign user error:", e)
        assignError.value = toUiError(e)
    } finally {
        assignLoading.value = false
    }
}

async function onUnassignUser(userId: string) {
    if (!organizationId.value || !openAssignmentsProjectId.value) return
    unassignLoadingUserId.value = userId
    try {
        await projectsApi.unassignUser(organizationId.value, openAssignmentsProjectId.value, userId)
        assignments.value = assignments.value.filter((a) => a.userId !== userId)
    } catch (e) {
        console.error("Unassign user error:", e)
        assignmentsError.value = toUiError(e)
    } finally {
        unassignLoadingUserId.value = null
    }
}
</script>

<template>
    <section class="card projects">
        <header class="projects__header">
            <h1 class="projects__title">Projects</h1>
            <p v-if="org" class="projects__subtitle">{{ org.name }}</p>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading && !projects.length">
            <p class="muted">Loading projects…</p>
        </template>

        <template v-else>
            <div class="projects__toolbar">
                <div class="projects__filters">
                    <label class="filter-label">Status</label>
                    <select v-model="filterActive" class="filter-select" @change="onFilterChange">
                        <option value="all">All</option>
                        <option :value="true">Active</option>
                        <option :value="false">Inactive</option>
                    </select>
                </div>
                <button
                    type="button"
                    class="btn btn-primary"
                    :aria-expanded="showAddForm"
                    @click="showAddForm = !showAddForm"
                >
                    {{ showAddForm ? "Cancel" : "New project" }}
                </button>
            </div>

            <form
                v-if="showAddForm"
                class="projects__add-form form"
                @submit.prevent="onAddProject"
            >
                <div class="form-row">
                    <label class="form-field">
                        <span class="form-field__label">Name</span>
                        <input
                            v-model.trim="addForm.name"
                            type="text"
                            required
                            placeholder="Project name"
                            autocomplete="off"
                        />
                    </label>
                    <label class="form-field">
                        <span class="form-field__label">Client</span>
                        <select v-model="addForm.clientId">
                            <option value="">Unassigned</option>
                            <option v-for="client in clients" :key="client.id" :value="client.id">
                                {{ client.name }}
                            </option>
                        </select>
                    </label>
                    <label class="form-field form-field--checkbox">
                        <input v-model="addForm.isActive" type="checkbox" />
                        <span class="form-field__label">Active</span>
                    </label>
                </div>
                <div v-if="addError" class="alert" role="alert">
                    <div class="alert__title">{{ addError.title }}</div>
                    <div class="alert__msg">{{ addError.message }}</div>
                </div>
                <button type="submit" class="btn btn-primary" :disabled="addLoading">
                    {{ addLoading ? "Creating…" : "Create project" }}
                </button>
            </form>

            <div class="projects__list-wrap">
                <table class="projects-table" v-if="projects.length">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Client</th>
                            <th>Status</th>
                            <th class="projects-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="project in projects" :key="project.id">
                            <tr>
                            <td>
                                <template v-if="editingProjectId === project.id">
                                    <input
                                        v-model.trim="editForm.name"
                                        type="text"
                                        class="edit-input"
                                        placeholder="Project name"
                                        @keydown.enter.prevent="onUpdateProject"
                                    />
                                </template>
                                <span v-else class="project-name">{{ project.name }}</span>
                            </td>
                            <td>
                                <template v-if="editingProjectId === project.id">
                                    <select v-model="editForm.clientId" class="edit-input">
                                        <option value="">Unassigned</option>
                                        <option
                                            v-for="client in clients"
                                            :key="client.id"
                                            :value="client.id"
                                        >
                                            {{ client.name }}
                                        </option>
                                    </select>
                                </template>
                                <span v-else>{{ clientName(project) }}</span>
                            </td>
                            <td>
                                <template v-if="editingProjectId === project.id">
                                    <label class="checkbox-inline">
                                        <input v-model="editForm.isActive" type="checkbox" />
                                        <span>Active</span>
                                    </label>
                                    <div class="edit-actions">
                                        <button
                                            type="button"
                                            class="btn btn-primary btn-sm"
                                            :disabled="updateLoading"
                                            @click="onUpdateProject"
                                        >
                                            {{ updateLoading ? "Saving…" : "Save" }}
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-secondary btn-sm"
                                            :disabled="updateLoading"
                                            @click="cancelEdit"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                    <div v-if="updateError" class="alert alert--inline">
                                        {{ updateError.message }}
                                    </div>
                                </template>
                                <span v-else :class="['status-badge', project.isActive !== false ? 'status-badge--active' : 'status-badge--inactive']">
                                    {{ project.isActive !== false ? "Active" : "Inactive" }}
                                </span>
                            </td>
                            <td class="projects-table__actions">
                                <div class="row-actions">
                                    <button
                                        type="button"
                                        class="btn btn-secondary btn-sm"
                                        :aria-expanded="openAssignmentsProjectId === project.id"
                                        @click="toggleAssignments(project.id)"
                                    >
                                        {{ openAssignmentsProjectId === project.id ? "Hide team" : "Team" }}
                                    </button>
                                    <button
                                        v-if="editingProjectId !== project.id"
                                        type="button"
                                        class="btn btn-secondary btn-sm"
                                        aria-label="Edit project"
                                        @click="startEdit(project)"
                                    >
                                        Edit
                                    </button>
                                </div>
                            </td>
                        </tr>
                            <tr v-if="openAssignmentsProjectId === project.id" class="projects-table__expanded">
                                <td :colspan="4">
                                    <div class="assignments">
                                        <div class="assignments__head">
                                            <strong>Assigned team members</strong>
                                            <button
                                                type="button"
                                                class="btn btn-secondary btn-sm"
                                                :disabled="assignmentsLoading"
                                                @click="loadAssignments(project.id)"
                                            >
                                                Refresh
                                            </button>
                                        </div>

                                        <div v-if="assignmentsError" class="alert alert--inline" role="alert">
                                            {{ assignmentsError.message }}
                                        </div>

                                        <p v-else-if="assignmentsLoading" class="muted">Loading assignments...</p>

                                        <ul v-else-if="assignments.length" class="assignments__list">
                                            <li v-for="a in assignments" :key="a.id" class="assignments__item">
                                                <div class="assignments__who">
                                                    <span class="assignments__name">{{ memberDisplayNameByUserId(a.userId) }}</span>
                                                    <span class="assignments__meta">{{ a.userId }}</span>
                                                </div>
                                                <button
                                                    v-if="isManagerOrAdmin"
                                                    type="button"
                                                    class="btn btn-secondary btn-sm"
                                                    :disabled="unassignLoadingUserId === a.userId"
                                                    @click="onUnassignUser(a.userId)"
                                                >
                                                    {{ unassignLoadingUserId === a.userId ? "Removing..." : "Remove" }}
                                                </button>
                                            </li>
                                        </ul>

                                        <p v-else class="muted">No team members assigned yet.</p>

                                        <div v-if="isManagerOrAdmin" class="assignments__add">
                                            <label class="form-field">
                                                <span class="form-field__label">Assign a member</span>
                                                <select
                                                    v-model="assignUserId"
                                                    :disabled="assignLoading || !assignCandidates.length"
                                                >
                                                    <option value="">Select a member...</option>
                                                    <option v-for="m in assignCandidates" :key="m.userId" :value="m.userId">
                                                        {{ memberDisplayNameByUserId(m.userId) }}
                                                    </option>
                                                </select>
                                            </label>
                                            <button
                                                type="button"
                                                class="btn btn-primary btn-sm"
                                                :disabled="assignLoading || !assignCandidates.length"
                                                @click="onAssignUser"
                                            >
                                                {{ assignLoading ? "Assigning..." : "Assign" }}
                                            </button>
                                            <div v-if="assignError" class="alert alert--inline" role="alert">
                                                {{ assignError.message }}
                                            </div>
                                        </div>

                                        <p v-else class="muted">Only managers/admins can change assignments.</p>
                                    </div>
                                </td>
                            </tr>
                        </template>
                    </tbody>
                </table>
                <p v-else class="muted">No projects yet. Create one above.</p>
            </div>
        </template>
    </section>
</template>

<style scoped>
.projects {
    padding: var(--s-5);
}

.projects__header {
    margin-bottom: var(--s-4);
}

.projects__title {
    margin: 0 0 var(--s-1) 0;
    font-size: 1.5rem;
}

.projects__subtitle {
    margin: 0;
    color: var(--text-2);
    font-size: 0.95rem;
}

.projects__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
}

.projects__filters {
    display: flex;
    align-items: center;
    gap: var(--s-2);
}

.filter-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-2);
}

.filter-select {
    min-width: 120px;
}

.projects__add-form {
    margin-bottom: var(--s-5);
    padding: var(--s-4);
    background: var(--surface-2);
    border-radius: var(--r-md);
}

.form-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--s-4);
    margin-bottom: var(--s-3);
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    min-width: 200px;
}

.form-field--checkbox {
    flex-direction: row;
    align-items: center;
    min-width: auto;
}

.form-field--checkbox input {
    width: auto;
    margin-right: var(--s-2);
}

.form-field__label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-2);
}

.form .alert {
    margin-bottom: var(--s-3);
}

.projects__list-wrap {
    overflow-x: auto;
}

.projects-table {
    width: 100%;
    border-collapse: collapse;
}

.projects-table th,
.projects-table td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--border);
}

.projects-table th {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
}

.projects-table__actions {
    width: 170px;
}

.project-name {
    font-weight: 600;
}

.edit-input {
    max-width: 240px;
}

.checkbox-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    font-size: 0.875rem;
}

.edit-actions {
    display: inline-flex;
    gap: var(--s-2);
    margin-top: var(--s-2);
}

.btn-sm {
    padding: 6px 10px;
    font-size: 0.875rem;
}

.row-actions {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
}

.status-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: var(--r-pill);
    font-size: 0.8125rem;
    font-weight: 600;
}

.status-badge--active {
    background: var(--success-soft);
    color: var(--success);
}

.status-badge--inactive {
    background: var(--surface-2);
    color: var(--text-3);
}

.alert--inline {
    margin-top: var(--s-2);
    padding: var(--s-2);
    font-size: 0.875rem;
}

.projects-table__expanded td {
    background: var(--surface-2);
}

.assignments {
    display: grid;
    gap: var(--s-3);
    padding: var(--s-3);
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: var(--surface);
}

.assignments__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
}

.assignments__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--s-2);
}

.assignments__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
}

.assignments__who {
    display: grid;
    gap: 2px;
}

.assignments__name {
    font-weight: 600;
}

.assignments__meta {
    color: var(--text-3);
    font-size: 0.75rem;
}

.assignments__add {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
    align-items: flex-end;
}

.muted {
    margin: 0;
    color: var(--text-2);
}
</style>
