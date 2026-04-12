<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import ProjectsCreatePanel from "~/components/projects/CreatePanel.vue"
import ProjectsFilterBar from "~/components/projects/FilterBar.vue"
import ProjectsHero from "~/components/projects/Hero.vue"
import ProjectsMemberPanel from "~/components/projects/MemberPanel.vue"
import ProjectsStatusBadge from "~/components/projects/StatusBadge.vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import {
    projectsApi,
    type Project,
    type CreateProjectRequest,
    type UpdateProjectRequest,
    type ProjectAssignment,
    type ProjectApprover,
} from "~/api/projectsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

type ProjectFilters = {
    query: string
    clientId: string
    status: "active" | "archived" | "all"
}

const defaultFilters = (): ProjectFilters => ({
    query: "",
    clientId: "all",
    status: "active",
})

const { user } = useAuth()
const route = useRoute()

const org = ref<Organization | null>(null)
const clients = ref<Client[]>([])
const projects = ref<Project[]>([])
const members = ref<OrganizationMember[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)

const draftFilters = ref<ProjectFilters>(defaultFilters())
const appliedFilters = ref<ProjectFilters>(defaultFilters())

const addForm = ref({ name: "", clientId: "", isActive: true })
const addLoading = ref(false)
const addError = ref<UiError | null>(null)
const showAddForm = ref(false)

const editingProjectId = ref<string | null>(null)
const editForm = ref({ name: "", clientId: "", isActive: true })
const updateLoading = ref(false)
const updateError = ref<UiError | null>(null)

const openAssignmentsProjectId = ref<string | null>(null)
const assignments = ref<ProjectAssignment[]>([])
const assignmentsLoading = ref(false)
const assignmentsError = ref<UiError | null>(null)
const assignUserId = ref("")
const assignLoading = ref(false)
const assignError = ref<UiError | null>(null)
const unassignLoadingUserId = ref<string | null>(null)

const openApproversProjectId = ref<string | null>(null)
const approvers = ref<ProjectApprover[]>([])
const approversLoading = ref(false)
const approversError = ref<UiError | null>(null)
const assignApproverUserId = ref("")
const assignApproverLoading = ref(false)
const assignApproverError = ref<UiError | null>(null)
const unassignApproverLoadingUserId = ref<string | null>(null)

const organizationId = computed(() => org.value?.id ?? "")

const memberMap = computed(() => {
    const map = new Map<string, OrganizationMember>()
    for (const member of members.value) map.set(member.userId, member)
    return map
})

const myMember = computed(() => {
    const userId = user.value?.userId
    if (!userId) return null
    return members.value.find((member) => member.userId === userId) ?? null
})

const isAdmin = computed(() => myMember.value?.role === 0)
const isManagerOrAdmin = computed(() => {
    const role = myMember.value?.role
    return role === 0 || role === 1
})

const clientOptions = computed(() => [
    { value: "all", label: "All Clients" },
    { value: "", label: "Unassigned" },
    ...clients.value.map((client) => ({ value: client.id, label: client.name })),
])

const createClientOptions = computed(() => [
    { value: "", label: "Unassigned" },
    ...clients.value.map((client) => ({ value: client.id, label: client.name })),
])

const filteredProjects = computed(() => {
    const needle = appliedFilters.value.query.trim().toLowerCase()
    const rows = projects.value.filter((project) => {
        if (!needle) return true
        const haystack = [project.name, project.code, clientName(project), project.description]
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .join(" ")
            .toLowerCase()
        return haystack.includes(needle)
    })

    return [...rows].sort((left, right) => {
        const leftActive = left.isActive !== false
        const rightActive = right.isActive !== false
        if (leftActive !== rightActive) return leftActive ? -1 : 1
        return String(left.name ?? "").localeCompare(String(right.name ?? ""))
    })
})

const totalProjects = computed(() => projects.value.length)
const activeProjects = computed(() => projects.value.filter((project) => project.isActive !== false).length)
const archivedProjects = computed(() => projects.value.filter((project) => project.isActive === false).length)
const heroMetrics = computed(() => [
    { label: "Total projects", value: totalProjects.value },
    { label: "Active", value: activeProjects.value },
    { label: "Archived", value: archivedProjects.value },
])

const assignedUserIds = computed(() => new Set(assignments.value.map((assignment) => assignment.userId)))
const assignCandidates = computed(() =>
    members.value
        .filter((member) => member.isActive)
        .filter((member) => !assignedUserIds.value.has(member.userId))
        .sort((a, b) => memberDisplayNameByUserId(a.userId).localeCompare(memberDisplayNameByUserId(b.userId)))
        .map((member) => ({ value: member.userId, label: memberDisplayNameByUserId(member.userId) }))
)

const assignedApproverUserIds = computed(() => new Set(approvers.value.map((approver) => approver.userId)))
const approverCandidates = computed(() =>
    members.value
        .filter((member) => member.isActive)
        .filter((member) => !assignedApproverUserIds.value.has(member.userId))
        .sort((a, b) => memberDisplayNameByUserId(a.userId).localeCompare(memberDisplayNameByUserId(b.userId)))
        .map((member) => ({ value: member.userId, label: memberDisplayNameByUserId(member.userId) }))
)

const assignmentItems = computed(() =>
    assignments.value.map((assignment) => ({ id: assignment.userId, label: memberDisplayNameByUserId(assignment.userId) }))
)

const approverItems = computed(() =>
    approvers.value.map((approver) => ({ id: approver.userId, label: memberDisplayNameByUserId(approver.userId) }))
)
const returnTo = computed(() => {
    const rawValue = route.query.returnTo
    const value = typeof rawValue === "string" ? rawValue : ""
    return isSafeInternalReturnTo(value) ? value : ""
})
const returnLabel = computed(() => {
    if (returnTo.value === "/track") return "Back to Track Time"
    if (returnTo.value === "/timesheets") return "Back to Timesheets"
    return "Back"
})

function buildListParams(filters: ProjectFilters) {
    return {
        isActive: filters.status === "all" ? undefined : filters.status === "active",
        clientId: filters.clientId === "all" ? undefined : filters.clientId || undefined,
    }
}

async function loadInitial() {
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

        const [projectsResult, clientsResult, membersResult] = await Promise.all([
            projectsApi.list(firstOrg.id, buildListParams(appliedFilters.value)),
            clientsApi.list(firstOrg.id),
            organizationsApi.getMembers(firstOrg.id),
        ])

        projects.value = projectsResult
        clients.value = clientsResult
        members.value = membersResult
    } catch (cause) {
        console.error("Load projects error:", cause)
        error.value = toUiError(cause)
    } finally {
        loading.value = false
    }
}

async function reloadProjects() {
    if (!organizationId.value) return
    loading.value = true
    error.value = null
    try {
        projects.value = await projectsApi.list(organizationId.value, buildListParams(appliedFilters.value))
    } catch (cause) {
        console.error("Reload projects error:", cause)
        error.value = toUiError(cause)
    } finally {
        loading.value = false
    }
}

function applyFilters() {
    appliedFilters.value = { ...draftFilters.value }
    void reloadProjects()
}

function resetFilters() {
    const next = defaultFilters()
    draftFilters.value = next
    appliedFilters.value = { ...next }
    void reloadProjects()
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
        await reloadProjects()
        addForm.value = { name: "", clientId: "", isActive: true }
        showAddForm.value = false
    } catch (cause) {
        console.error("Create project error:", cause)
        addError.value = toUiError(cause)
    } finally {
        addLoading.value = false
    }
}

function startEdit(project: Project) {
    editingProjectId.value = project.id
    editForm.value = {
        name: String(project.name ?? ""),
        clientId: String(project.clientId ?? ""),
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
        await reloadProjects()
        editingProjectId.value = null
    } catch (cause) {
        console.error("Update project error:", cause)
        updateError.value = toUiError(cause)
    } finally {
        updateLoading.value = false
    }
}

function clientName(project: Project) {
    if (project.clientName) return project.clientName
    if (!project.clientId) return "Unassigned"
    const client = clients.value.find((item) => item.id === project.clientId)
    return client?.name ?? "Unassigned"
}

function memberDisplayNameByUserId(userId?: string) {
    if (!userId) return "Unknown member"
    const member = memberMap.value.get(userId)
    if (!member) return "Unknown member"
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
    return name || "Unknown member"
}

function projectInitials(name?: string) {
    const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2)
    if (!parts.length) return "PR"
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("")
}

function projectMeta(project: Project) {
    if (project.code) return project.code
    return `Project ${project.id.slice(0, 8).toUpperCase()}`
}

function setProjectApproverIds(projectId: string, userIds: string[]) {
    projects.value = projects.value.map((project) =>
        project.id === projectId
            ? { ...project, approverUserIds: [...userIds].sort((a, b) => a.localeCompare(b)) }
            : project
    )
}

function projectApproverNames(project: Project) {
    const userIds = project.approverUserIds ?? []
    if (!userIds.length) return "None"
    return userIds.map((userId) => memberDisplayNameByUserId(userId)).join(", ")
}

async function loadAssignments(projectId: string) {
    if (!organizationId.value) return
    assignmentsLoading.value = true
    assignmentsError.value = null
    try {
        assignments.value = await projectsApi.getAssignments(organizationId.value, projectId)
    } catch (cause) {
        console.error("Load assignments error:", cause)
        assignmentsError.value = toUiError(cause)
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
    openApproversProjectId.value = null
    openAssignmentsProjectId.value = projectId
    assignUserId.value = ""
    await loadAssignments(projectId)
}

async function onAssignUser() {
    if (!organizationId.value || !openAssignmentsProjectId.value) return
    assignError.value = null
    const userId = assignUserId.value.trim()
    if (!userId) {
        assignError.value = { title: "User required", message: "Select a team member to assign." }
        return
    }
    assignLoading.value = true
    try {
        await projectsApi.assignUser(organizationId.value, openAssignmentsProjectId.value, { userId })
        assignUserId.value = ""
        await loadAssignments(openAssignmentsProjectId.value)
    } catch (cause) {
        console.error("Assign user error:", cause)
        assignError.value = toUiError(cause)
    } finally {
        assignLoading.value = false
    }
}

async function onUnassignUser(userId: string) {
    if (!organizationId.value || !openAssignmentsProjectId.value) return
    unassignLoadingUserId.value = userId
    try {
        await projectsApi.unassignUser(organizationId.value, openAssignmentsProjectId.value, userId)
        assignments.value = assignments.value.filter((assignment) => assignment.userId !== userId)
    } catch (cause) {
        console.error("Unassign user error:", cause)
        assignmentsError.value = toUiError(cause)
    } finally {
        unassignLoadingUserId.value = null
    }
}

async function loadApprovers(projectId: string) {
    if (!organizationId.value) return
    approversLoading.value = true
    approversError.value = null
    try {
        approvers.value = await projectsApi.getApprovers(organizationId.value, projectId)
        setProjectApproverIds(projectId, approvers.value.map((approver) => approver.userId))
    } catch (cause) {
        console.error("Load approvers error:", cause)
        approversError.value = toUiError(cause)
    } finally {
        approversLoading.value = false
    }
}

async function toggleApprovers(projectId: string) {
    assignApproverError.value = null
    approversError.value = null
    if (openApproversProjectId.value === projectId) {
        openApproversProjectId.value = null
        return
    }
    openAssignmentsProjectId.value = null
    openApproversProjectId.value = projectId
    assignApproverUserId.value = ""
    await loadApprovers(projectId)
}

async function onAssignApprover() {
    if (!organizationId.value || !openApproversProjectId.value) return
    assignApproverError.value = null
    const userId = assignApproverUserId.value.trim()
    if (!userId) {
        assignApproverError.value = { title: "Approver required", message: "Select a member to assign." }
        return
    }
    assignApproverLoading.value = true
    try {
        await projectsApi.assignApprover(organizationId.value, openApproversProjectId.value, { userId })
        assignApproverUserId.value = ""
        await loadApprovers(openApproversProjectId.value)
    } catch (cause) {
        console.error("Assign approver error:", cause)
        assignApproverError.value = toUiError(cause)
    } finally {
        assignApproverLoading.value = false
    }
}

async function onUnassignApprover(userId: string) {
    if (!organizationId.value || !openApproversProjectId.value) return
    unassignApproverLoadingUserId.value = userId
    try {
        await projectsApi.unassignApprover(organizationId.value, openApproversProjectId.value, userId)
        approvers.value = approvers.value.filter((approver) => approver.userId !== userId)
        setProjectApproverIds(openApproversProjectId.value, approvers.value.map((approver) => approver.userId))
    } catch (cause) {
        console.error("Unassign approver error:", cause)
        approversError.value = toUiError(cause)
    } finally {
        unassignApproverLoadingUserId.value = null
    }
}

function rowExpanded(projectId: string) {
    return (
        editingProjectId.value === projectId ||
        openAssignmentsProjectId.value === projectId ||
        openApproversProjectId.value === projectId
    )
}

function applyRouteInstructions() {
    showAddForm.value = isManagerOrAdmin.value && route.query.create === "1"
}

function isSafeInternalReturnTo(value: string) {
    return value.startsWith("/") && !value.startsWith("//")
}

onMounted(async () => {
    await loadInitial()
    applyRouteInstructions()
})
</script>

<template>
    <section class="projects-page">
        <ProjectsHero
            breadcrumb="Management / Projects"
            title="Active Projects"
            subtitle="Create projects, keep ownership clear, and manage team assignments without leaving the workspace."
            :metrics="heroMetrics"
            :can-create="isManagerOrAdmin"
            :create-open="showAddForm"
            create-label="Create New Project"
            close-label="Close project form"
            @toggle-create="showAddForm = !showAddForm"
        />

        <div v-if="returnTo" class="projects-page__return">
            <NuxtLink :to="returnTo" class="btn btn-secondary">
                {{ returnLabel }}
            </NuxtLink>
        </div>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading && !projects.length">
            <section class="card projects-page__loading">
                <p class="muted">Loading projects workspace...</p>
            </section>
        </template>

        <template v-else>
            <ProjectsCreatePanel
                v-if="showAddForm && isManagerOrAdmin"
                v-model="addForm"
                :clients="createClientOptions"
                :loading="addLoading"
                :error-message="addError?.message ?? null"
                @submit="onAddProject"
                @cancel="showAddForm = false"
            />

            <ProjectsFilterBar
                :query="draftFilters.query"
                :client-id="draftFilters.clientId"
                :status="draftFilters.status"
                :clients="clientOptions"
                :loading="loading"
                @update:query="draftFilters.query = $event"
                @update:client-id="draftFilters.clientId = $event"
                @update:status="draftFilters.status = $event"
                @apply="applyFilters"
                @reset="resetFilters"
            />

            <section v-if="!filteredProjects.length" class="card projects-page__empty">
                <p class="projects-page__empty-title">No projects match the current filters.</p>
                <p class="muted">Adjust your search parameters.</p>
            </section>

            <section v-else class="card projects-table-card">
                <div class="projects-table-card__scroll">
                    <table class="projects-table">
                        <thead>
                            <tr>
                                <th>Project Name</th>
                                <th>Client</th>
                                <th>Status</th>
                                <th>Approvers</th>
                                <th class="projects-table__actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <template v-for="project in filteredProjects" :key="project.id">
                                <tr class="projects-table__row">
                                    <td>
                                        <div class="projects-table__project">
                                            <div class="projects-table__icon">{{ projectInitials(project.name) }}</div>
                                            <div>
                                                <strong class="projects-table__name">{{ project.name }}</strong>
                                                <p class="projects-table__meta">{{ projectMeta(project) }}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="projects-table__client">{{ clientName(project) }}</div>
                                    </td>
                                    <td>
                                        <ProjectsStatusBadge :active="project.isActive !== false" />
                                    </td>
                                    <td>
                                        <div class="projects-table__approvers">
                                            <div class="projects-table__approver-summary">{{ projectApproverNames(project) }}</div>
                                            <p class="projects-table__meta">
                                                {{
                                                    (project.approverUserIds?.length ?? 0) > 0
                                                        ? `${project.approverUserIds?.length} approver(s) linked`
                                                        : "Open approvers to manage ownership"
                                                }}
                                            </p>
                                        </div>
                                    </td>
                                    <td class="projects-table__actions">
                                        <div class="projects-table__action-row">
                                            <button
                                                type="button"
                                                class="btn btn-secondary btn-sm"
                                                :aria-expanded="openAssignmentsProjectId === project.id"
                                                @click="toggleAssignments(project.id)"
                                            >
                                                {{ openAssignmentsProjectId === project.id ? "Hide Team" : "Team" }}
                                            </button>
                                            <button
                                                type="button"
                                                class="btn btn-secondary btn-sm"
                                                :aria-expanded="openApproversProjectId === project.id"
                                                @click="toggleApprovers(project.id)"
                                            >
                                                {{ openApproversProjectId === project.id ? "Hide Approvers" : "Approvers" }}
                                            </button>
                                            <button
                                                v-if="isManagerOrAdmin"
                                                type="button"
                                                class="btn btn-secondary btn-sm"
                                                @click="editingProjectId === project.id ? cancelEdit() : startEdit(project)"
                                            >
                                                {{ editingProjectId === project.id ? "Close Edit" : "Edit" }}
                                            </button>
                                        </div>
                                    </td>
                                </tr>

                                <tr v-if="rowExpanded(project.id)" class="projects-table__expanded">
                                    <td colspan="5">
                                        <div class="projects-detail-grid">
                                            <section
                                                v-if="editingProjectId === project.id && isManagerOrAdmin"
                                                class="projects-detail-card"
                                            >
                                                <div class="projects-detail-card__head">
                                                    <strong>Edit project details</strong>
                                                    <p>Update the project label, client, or status.</p>
                                                </div>

                                                <div class="projects-edit-form">
                                                    <label class="projects-edit-form__field projects-edit-form__field--wide">
                                                        <span class="projects-edit-form__label">Project name</span>
                                                        <input
                                                            v-model.trim="editForm.name"
                                                            type="text"
                                                            placeholder="Project name"
                                                            @keydown.enter.prevent="onUpdateProject"
                                                        />
                                                    </label>

                                                    <label class="projects-edit-form__field">
                                                        <span class="projects-edit-form__label">Client</span>
                                                        <select v-model="editForm.clientId">
                                                            <option value="">Unassigned</option>
                                                            <option v-for="client in clients" :key="client.id" :value="client.id">
                                                                {{ client.name }}
                                                            </option>
                                                        </select>
                                                    </label>

                                                    <label class="projects-edit-form__field">
                                                        <span class="projects-edit-form__label">Status</span>
                                                        <select v-model="editForm.isActive">
                                                            <option :value="true">Active</option>
                                                            <option :value="false">Archived</option>
                                                        </select>
                                                    </label>
                                                </div>

                                                <div v-if="updateError" class="alert alert--inline" role="alert">
                                                    {{ updateError.message }}
                                                </div>

                                                <div class="projects-detail-card__actions">
                                                    <button type="button" class="btn btn-secondary" @click="cancelEdit">
                                                        Cancel
                                                    </button>
                                                    <button type="button" class="btn btn-primary" :disabled="updateLoading" @click="onUpdateProject">
                                                        {{ updateLoading ? "Saving..." : "Save Changes" }}
                                                    </button>
                                                </div>
                                            </section>

                                            <section v-if="openAssignmentsProjectId === project.id" class="projects-detail-card">
                                                <ProjectsMemberPanel
                                                    title="Assigned team members"
                                                    :loading="assignmentsLoading"
                                                    :error="assignmentsError?.message ?? assignError?.message ?? null"
                                                    :items="assignmentItems"
                                                    empty-text="No team members assigned yet."
                                                    :can-manage="isManagerOrAdmin"
                                                    manage-hint="Only managers/admins can change assignments."
                                                    select-label="Assign a member"
                                                    :selected-user-id="assignUserId"
                                                    :candidates="assignCandidates"
                                                    :add-busy="assignLoading"
                                                    :remove-busy-id="unassignLoadingUserId"
                                                    @refresh="loadAssignments(project.id)"
                                                    @update:selected-user-id="assignUserId = $event"
                                                    @add="onAssignUser"
                                                    @remove="onUnassignUser"
                                                />
                                            </section>

                                            <section v-if="openApproversProjectId === project.id" class="projects-detail-card">
                                                <ProjectsMemberPanel
                                                    title="Project approvers"
                                                    :loading="approversLoading"
                                                    :error="approversError?.message ?? assignApproverError?.message ?? null"
                                                    :items="approverItems"
                                                    empty-text="No approvers assigned yet."
                                                    :can-manage="isAdmin"
                                                    manage-hint="Only admins can change project approvers."
                                                    select-label="Assign an approver"
                                                    :selected-user-id="assignApproverUserId"
                                                    :candidates="approverCandidates"
                                                    :add-busy="assignApproverLoading"
                                                    :remove-busy-id="unassignApproverLoadingUserId"
                                                    @refresh="loadApprovers(project.id)"
                                                    @update:selected-user-id="assignApproverUserId = $event"
                                                    @add="onAssignApprover"
                                                    @remove="onUnassignApprover"
                                                />
                                            </section>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </section>
        </template>
    </section>
</template>

<style scoped>
.projects-page {
    display: grid;
    gap: var(--s-4);
}

.projects-page__return {
    display: flex;
}

.projects-page__loading,
.projects-page__empty {
    padding: var(--s-5);
}

.projects-page__empty-title {
    margin: 0 0 var(--s-1);
    font-weight: 700;
}

.projects-table-card {
    overflow: hidden;
}

.projects-table-card__scroll {
    overflow-x: auto;
}

.projects-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}

.projects-table th,
.projects-table td {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
}

.projects-table th {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    background: #fbfcfe;
    white-space: nowrap;
}

.projects-table__row {
    transition: background-color 180ms ease;
}

.projects-table__row:hover td {
    background: #fcfdfd;
}

.projects-table__project {
    display: flex;
    align-items: center;
    gap: var(--s-3);
}

.projects-table__icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(15, 118, 110, 0.15) 0%, rgba(15, 118, 110, 0.05) 100%);
    color: var(--primary);
    font-size: 0.88rem;
    font-weight: 800;
    letter-spacing: 0.06em;
}

.projects-table__name {
    display: block;
    color: var(--text-1);
}

.projects-table__client,
.projects-table__approver-summary {
    font-weight: 600;
    color: var(--text-1);
}

.projects-table__meta {
    margin: 4px 0 0;
    color: var(--text-2);
    font-size: 0.82rem;
}

.projects-table__approvers {
    max-width: 280px;
}

.projects-table__actions {
    width: 260px;
}

.projects-table__action-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}

.projects-table__expanded td {
    background: #fbfcfd;
}

.projects-detail-grid {
    display: grid;
    gap: var(--s-3);
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    padding: var(--s-2) 0 var(--s-3);
}

.projects-detail-card {
    display: grid;
    gap: var(--s-3);
    padding: var(--s-4);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: #fff;
}

.projects-detail-card__head p {
    margin: 4px 0 0;
    color: var(--text-2);
    font-size: 0.9rem;
}

.projects-detail-card__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
}

.projects-edit-form {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(180px, 1fr) minmax(140px, 0.8fr);
    gap: var(--s-3);
}

.projects-edit-form__field {
    display: grid;
    gap: 6px;
}

.projects-edit-form__label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
}

.alert {
    border: 1px solid #f1c3c3;
    border-radius: var(--r-md);
    background: #fff7f7;
    color: #8a1f1f;
    padding: var(--s-3) var(--s-4);
}

.alert__title {
    font-weight: 700;
}

.alert__msg {
    margin-top: 4px;
}

.alert--inline {
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@media (max-width: 900px) {
    .projects-edit-form {
        grid-template-columns: 1fr;
    }

    .projects-detail-card__actions {
        justify-content: flex-start;
    }
}
</style>
