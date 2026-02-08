<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

import { ref, computed, onMounted } from "vue"
import {
    organizationsApi,
    type Organization,
    type OrganizationMember,
} from "~/api/organizationsApi"
import {
    projectsApi,
    type Project,
    type CreateProjectRequest,
    type UpdateProjectRequest,
    type ProjectAssignment,
} from "~/api/projectsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"
import { useAuth } from "~/composables/useAuth"

const org = ref<Organization | null>(null)
const projects = ref<Project[]>([])
const members = ref<OrganizationMember[]>([])
const assignmentsByProject = ref<Record<string, ProjectAssignment[]>>({})
const assignmentSelection = ref<Record<string, string[]>>({})
const assignmentSaving = ref<Record<string, boolean>>({})
const loading = ref(true)
const error = ref<UiError | null>(null)

const filterActive = ref<boolean | "all">("all")

const addForm = ref({ name: "", isActive: true })
const addLoading = ref(false)
const addError = ref<UiError | null>(null)
const showAddForm = ref(false)

const editingProjectId = ref<string | null>(null)
const editForm = ref<{ name: string; isActive: boolean }>({ name: "", isActive: true })
const updateLoading = ref(false)
const updateError = ref<UiError | null>(null)

const { user } = useAuth()

const organizationId = computed(() => org.value?.id ?? "")
const currentUserId = computed(() => user.value?.userId ?? "")
const currentMember = computed(() =>
    members.value.find((member) => member.userId === currentUserId.value)
)
const canManageAssignments = computed(
    () => currentMember.value?.role === 0 || currentMember.value?.role === 1
)

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
        org.value = orgs[0]
        if (org.value?.id) {
            const [membersResponse, projectsResponse] = await Promise.all([
                organizationsApi.getMembers(org.value.id),
                projectsApi.list(org.value.id, listParams.value),
            ])
            members.value = membersResponse
            await hydrateAssignments(projectsResponse)
            projects.value = filterProjectsByAssignment(projectsResponse)
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
    loading.value = true
    error.value = null
    try {
        const response = await projectsApi.list(organizationId.value, listParams.value)
        await hydrateAssignments(response)
        projects.value = filterProjectsByAssignment(response)
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
            isActive: addForm.value.isActive,
        }
        await projectsApi.create(organizationId.value, payload)
        await loadProjects()
        addForm.value = { name: "", isActive: true }
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

async function hydrateAssignments(projectList: Project[]) {
    if (!organizationId.value) return
    const entries = await Promise.all(
        projectList.map(async (project) => {
            const assignments = await projectsApi.listAssignments(
                organizationId.value,
                project.id
            )
            return [project.id, assignments] as const
        })
    )
    assignmentsByProject.value = Object.fromEntries(entries)
    assignmentSelection.value = Object.fromEntries(
        entries.map(([projectId, assignments]) => [
            projectId,
            assignments.map((assignment) => assignment.userId),
        ])
    )
}

function filterProjectsByAssignment(projectList: Project[]) {
    if (canManageAssignments.value) return projectList
    if (!currentUserId.value) return []
    const assignedProjectIds = new Set(
        Object.entries(assignmentsByProject.value)
            .filter(([, assignments]) =>
                assignments.some((assignment) => assignment.userId === currentUserId.value)
            )
            .map(([projectId]) => projectId)
    )
    return projectList.filter((project) => assignedProjectIds.has(project.id))
}

const memberDisplayName = (member: OrganizationMember) => {
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ")
    return name || member.userId || "Unknown member"
}

const assignmentNames = (projectId: string) => {
    const assignments = assignmentsByProject.value[projectId] ?? []
    return assignments.map((assignment) => {
        const member = members.value.find((entry) => entry.userId === assignment.userId)
        return member ? memberDisplayName(member) : assignment.userId
    })
}

async function onAssignmentsChange(projectId: string) {
    if (!organizationId.value || !canManageAssignments.value) return
    const selection = new Set(assignmentSelection.value[projectId] ?? [])
    const currentAssignments = new Set(
        (assignmentsByProject.value[projectId] ?? []).map((assignment) => assignment.userId)
    )
    const toAssign = [...selection].filter((userId) => !currentAssignments.has(userId))
    const toUnassign = [...currentAssignments].filter((userId) => !selection.has(userId))

    if (!toAssign.length && !toUnassign.length) return

    assignmentSaving.value = { ...assignmentSaving.value, [projectId]: true }
    try {
        for (const userId of toAssign) {
            await projectsApi.assignUser(organizationId.value, projectId, { userId })
        }
        for (const userId of toUnassign) {
            await projectsApi.unassignUser(organizationId.value, projectId, userId)
        }
        const assignments = await projectsApi.listAssignments(organizationId.value, projectId)
        assignmentsByProject.value = {
            ...assignmentsByProject.value,
            [projectId]: assignments,
        }
        assignmentSelection.value = {
            ...assignmentSelection.value,
            [projectId]: assignments.map((assignment) => assignment.userId),
        }
    } catch (e) {
        console.error("Update project assignments error:", e)
        error.value = toUiError(e)
    } finally {
        assignmentSaving.value = { ...assignmentSaving.value, [projectId]: false }
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
                    {{ showAddForm ? "Cancel" : "Create New Project" }}
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
                            <th>Status</th>
                            <th>Assignments</th>
                            <th class="projects-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="project in projects" :key="project.id">
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
                            <td>
                                <div class="assignment-summary">
                                    <span v-if="assignmentNames(project.id).length">
                                        {{ assignmentNames(project.id).join(", ") }}
                                    </span>
                                    <span v-else class="muted">No assignments</span>
                                </div>
                                <div v-if="canManageAssignments" class="assignment-controls">
                                    <label class="assignment-label" :for="`assignments-${project.id}`">
                                        Manage assignments
                                    </label>
                                    <select
                                        :id="`assignments-${project.id}`"
                                        v-model="assignmentSelection[project.id]"
                                        class="assignment-select"
                                        multiple
                                        :disabled="assignmentSaving[project.id]"
                                        @change="onAssignmentsChange(project.id)"
                                    >
                                        <option
                                            v-for="member in members"
                                            :key="member.userId"
                                            :value="member.userId"
                                        >
                                            {{ memberDisplayName(member) }}
                                        </option>
                                    </select>
                                    <span
                                        v-if="assignmentSaving[project.id]"
                                        class="assignment-saving"
                                    >
                                        Saving assignments…
                                    </span>
                                </div>
                            </td>
                            <td class="projects-table__actions">
                                <button
                                    v-if="editingProjectId !== project.id"
                                    type="button"
                                    class="btn btn-secondary btn-sm"
                                    aria-label="Edit project"
                                    @click="startEdit(project)"
                                >
                                    Edit
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="muted">No assigned projects yet. Create one above.</p>
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
    width: 120px;
}

.assignment-summary {
    font-size: 0.875rem;
    margin-bottom: var(--s-2);
}

.assignment-controls {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 220px;
}

.assignment-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-3);
    letter-spacing: 0.04em;
}

.assignment-select {
    min-height: 110px;
}

.assignment-saving {
    font-size: 0.8125rem;
    color: var(--text-3);
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

.muted {
    margin: 0;
    color: var(--text-2);
}
</style>
