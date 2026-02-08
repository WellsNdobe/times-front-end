<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

import { ref, computed, onMounted } from "vue"
import {
    organizationsApi,
    type Organization,
    type OrganizationMember,
    type AddMemberRequest,
    type CreateUserMemberRequest,
    type UpdateMemberRequest,
} from "~/api/organizationsApi"
import { projectsApi, type Project, type ProjectAssignment } from "~/api/projectsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"
import { useAuth } from "~/composables/useAuth"

const org = ref<Organization | null>(null)
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const assignmentsByProject = ref<Record<string, ProjectAssignment[]>>({})
const memberProjectSelection = ref<Record<string, string[]>>({})
const assignmentSaving = ref<Record<string, boolean>>({})
const loading = ref(true)
const error = ref<UiError | null>(null)

const addMode = ref<"existing" | "create">("existing")
const addForm = ref({
    userId: "",
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    role: 2,
})
const addLoading = ref(false)
const addError = ref<UiError | null>(null)
const showAddForm = ref(false)

const editingMemberId = ref<string | null>(null)
const editRole = ref(2)
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

async function loadTeam() {
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
                projectsApi.list(org.value.id),
            ])
            members.value = membersResponse
            projects.value = projectsResponse
            await hydrateAssignments(projectsResponse)
            buildMemberProjectSelections()
        }
    } catch (e) {
        console.error("Load team error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

onMounted(() => loadTeam())

async function onAddMember() {
    addError.value = null
    addLoading.value = true
    try {
        if (!organizationId.value) {
            addError.value = {
                title: "Missing organization",
                message: "Select an organization before adding a team member.",
            }
            return
        }
        if (addMode.value === "existing") {
            if (!addForm.value.userId.trim()) {
                addError.value = {
                    title: "Missing user id",
                    message: "Enter a valid user id before adding an existing user.",
                }
                return
            }
            const payload: AddMemberRequest = {
                userId: addForm.value.userId.trim(),
                role: addForm.value.role,
            }
            await organizationsApi.addMember(organizationId.value, payload)
        } else {
            if (
                !addForm.value.email.trim() ||
                !addForm.value.firstName.trim() ||
                !addForm.value.lastName.trim() ||
                !addForm.value.password
            ) {
                addError.value = {
                    title: "Missing details",
                    message: "Fill out all fields before creating a new user.",
                }
                return
            }
            const payload: CreateUserMemberRequest = {
                email: addForm.value.email.trim(),
                firstName: addForm.value.firstName.trim(),
                lastName: addForm.value.lastName.trim(),
                password: addForm.value.password,
                role: addForm.value.role,
            }
            await organizationsApi.createMemberWithUser(organizationId.value, payload)
        }
        await loadTeam()
        addForm.value = {
            userId: "",
            email: "",
            firstName: "",
            lastName: "",
            password: "",
            role: 2,
        }
        showAddForm.value = false
    } catch (e) {
        console.error("Add member error:", e)
        addError.value = toUiError(e)
    } finally {
        addLoading.value = false
    }
}

function startEdit(member: OrganizationMember) {
    editingMemberId.value = member.id
    editRole.value = member.role ?? 2
    updateError.value = null
}

function cancelEdit() {
    editingMemberId.value = null
    updateError.value = null
}

async function onUpdateMember() {
    if (!editingMemberId.value) return
    updateError.value = null
    updateLoading.value = true
    try {
        const payload: UpdateMemberRequest = { role: editRole.value }
        await organizationsApi.updateMember(organizationId.value, editingMemberId.value, payload)
        await loadTeam()
        editingMemberId.value = null
    } catch (e) {
        console.error("Update member error:", e)
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
}

function buildMemberProjectSelections() {
    const selections: Record<string, string[]> = {}
    for (const member of members.value) {
        selections[member.userId] = projects.value
            .filter((project) =>
                (assignmentsByProject.value[project.id] ?? []).some(
                    (assignment) => assignment.userId === member.userId
                )
            )
            .map((project) => project.id)
    }
    memberProjectSelection.value = selections
}

const assignedProjectNames = (member: OrganizationMember) => {
    return projects.value
        .filter((project) =>
            (assignmentsByProject.value[project.id] ?? []).some(
                (assignment) => assignment.userId === member.userId
            )
        )
        .map((project) => project.name)
}

async function onMemberAssignmentsChange(member: OrganizationMember) {
    if (!organizationId.value || !canManageAssignments.value) return
    const selection = new Set(memberProjectSelection.value[member.userId] ?? [])
    const currentAssigned = new Set(
        projects.value
            .filter((project) =>
                (assignmentsByProject.value[project.id] ?? []).some(
                    (assignment) => assignment.userId === member.userId
                )
            )
            .map((project) => project.id)
    )
    const toAssign = [...selection].filter((projectId) => !currentAssigned.has(projectId))
    const toUnassign = [...currentAssigned].filter((projectId) => !selection.has(projectId))

    if (!toAssign.length && !toUnassign.length) return

    assignmentSaving.value = { ...assignmentSaving.value, [member.userId]: true }
    try {
        for (const projectId of toAssign) {
            await projectsApi.assignUser(organizationId.value, projectId, {
                userId: member.userId,
            })
        }
        for (const projectId of toUnassign) {
            await projectsApi.unassignUser(organizationId.value, projectId, member.userId)
        }
        const refreshed = await Promise.all(
            [...new Set([...toAssign, ...toUnassign])].map(async (projectId) => {
                const assignments = await projectsApi.listAssignments(
                    organizationId.value,
                    projectId
                )
                return [projectId, assignments] as const
            })
        )
        assignmentsByProject.value = {
            ...assignmentsByProject.value,
            ...Object.fromEntries(refreshed),
        }
        buildMemberProjectSelections()
    } catch (e) {
        console.error("Update member assignments error:", e)
        error.value = toUiError(e)
    } finally {
        assignmentSaving.value = { ...assignmentSaving.value, [member.userId]: false }
    }
}

const roleOptions = [
    { label: "Admin", value: 0 },
    { label: "Manager", value: 1 },
    { label: "Employee", value: 2 },
]

const roleLabelByValue = (role?: number) =>
    roleOptions.find((option) => option.value === role)?.label ?? "—"

const statusLabel = (member: OrganizationMember) => (member.isActive ? "Active" : "Inactive")

const memberDisplayName = (member: OrganizationMember) => {
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ")
    return name || member.userId || "Unknown member"
}

const memberMeta = (member: OrganizationMember) =>
    member.userId ? `ID: ${member.userId}` : "Active team member"
</script>

<template>
    <section class="card team">
        <header class="team__header">
            <h1 class="team__title">Team</h1>
            <p v-if="org" class="team__subtitle">{{ org.name }} – manage members</p>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <p class="muted">Loading team…</p>
        </template>

        <template v-else>
            <div class="team__actions">
                <button
                    type="button"
                    class="btn btn-primary"
                    :aria-expanded="showAddForm"
                    @click="showAddForm = !showAddForm"
                >
                    {{ showAddForm ? "Cancel" : "Add member" }}
                </button>
            </div>

            <form
                v-if="showAddForm"
                class="team__add-form form"
                @submit.prevent="onAddMember"
            >
                <div class="form-row">
                    <label class="form-field">
                        <span class="form-field__label">Add type</span>
                        <select v-model="addMode">
                            <option value="existing">Add existing user</option>
                            <option value="create">Create new user</option>
                        </select>
                    </label>
                </div>
                <div class="form-row">
                    <label v-if="addMode === 'existing'" class="form-field">
                        <span class="form-field__label">User identifier</span>
                        <input
                            v-model.trim="addForm.userId"
                            type="text"
                            required
                            placeholder="user_123"
                            autocomplete="off"
                        />
                        <span class="form-field__hint">
                            Ask the user for their profile ID if they already have an account.
                        </span>
                    </label>
                    <template v-else>
                        <label class="form-field">
                            <span class="form-field__label">Email</span>
                            <input
                                v-model.trim="addForm.email"
                                type="email"
                                required
                                placeholder="colleague@example.com"
                                autocomplete="email"
                            />
                        </label>
                        <label class="form-field">
                            <span class="form-field__label">First name</span>
                            <input
                                v-model.trim="addForm.firstName"
                                type="text"
                                required
                                placeholder="Alex"
                                autocomplete="given-name"
                            />
                        </label>
                        <label class="form-field">
                            <span class="form-field__label">Last name</span>
                            <input
                                v-model.trim="addForm.lastName"
                                type="text"
                                required
                                placeholder="Lee"
                                autocomplete="family-name"
                            />
                        </label>
                        <label class="form-field">
                            <span class="form-field__label">Temporary password</span>
                            <input
                                v-model="addForm.password"
                                type="password"
                                required
                                placeholder="At least 8 characters"
                                autocomplete="new-password"
                            />
                        </label>
                    </template>
                    <label class="form-field">
                        <span class="form-field__label">Role</span>
                        <select v-model.number="addForm.role">
                            <option
                                v-for="r in roleOptions"
                                :key="r.value"
                                :value="r.value"
                            >
                                {{ r.label }}
                            </option>
                        </select>
                    </label>
                </div>
                <div v-if="addError" class="alert" role="alert">
                    <div class="alert__title">{{ addError.title }}</div>
                    <div class="alert__msg">{{ addError.message }}</div>
                </div>
                <button type="submit" class="btn btn-primary" :disabled="addLoading">
                    {{ addLoading ? "Adding…" : "Add member" }}
                </button>
            </form>

            <div class="team__list-wrap">
                <table class="team-table" v-if="members.length">
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Projects</th>
                            <th class="team-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="member in members" :key="member.id">
                            <td>
                                <span class="member-name">{{ memberDisplayName(member) }}</span>
                                <span class="member-meta">{{ memberMeta(member) }}</span>
                            </td>
                            <td>
                                <template v-if="editingMemberId === member.id">
                                    <select v-model.number="editRole" class="edit-role">
                                        <option
                                            v-for="r in roleOptions"
                                            :key="r.value"
                                            :value="r.value"
                                        >
                                            {{ r.label }}
                                        </option>
                                    </select>
                                    <div class="edit-actions">
                                        <button
                                            type="button"
                                            class="btn btn-primary btn-sm"
                                            :disabled="updateLoading"
                                            @click="onUpdateMember"
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
                                <span v-else>{{ roleLabelByValue(member.role) }}</span>
                            </td>
                            <td>
                                <span>{{ statusLabel(member) }}</span>
                            </td>
                            <td>
                                <div class="assignment-summary">
                                    <span v-if="assignedProjectNames(member).length">
                                        {{ assignedProjectNames(member).join(", ") }}
                                    </span>
                                    <span v-else class="muted">No assignments</span>
                                </div>
                                <div v-if="canManageAssignments" class="assignment-controls">
                                    <label
                                        class="assignment-label"
                                        :for="`member-assignments-${member.id}`"
                                    >
                                        Manage projects
                                    </label>
                                    <select
                                        :id="`member-assignments-${member.id}`"
                                        v-model="memberProjectSelection[member.userId]"
                                        class="assignment-select"
                                        multiple
                                        :disabled="assignmentSaving[member.userId]"
                                        @change="onMemberAssignmentsChange(member)"
                                    >
                                        <option
                                            v-for="project in projects"
                                            :key="project.id"
                                            :value="project.id"
                                        >
                                            {{ project.name }}
                                        </option>
                                    </select>
                                    <span
                                        v-if="assignmentSaving[member.userId]"
                                        class="assignment-saving"
                                    >
                                        Saving assignments…
                                    </span>
                                </div>
                            </td>
                            <td class="team-table__actions">
                                <button
                                    v-if="editingMemberId !== member.id"
                                    type="button"
                                    class="btn btn-secondary btn-sm"
                                    aria-label="Edit role"
                                    @click="startEdit(member)"
                                >
                                    Edit
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="muted">No members yet. Add someone above.</p>
            </div>
        </template>
    </section>
</template>

<style scoped>
.team {
    padding: var(--s-5);
}

.team__header {
    margin-bottom: var(--s-4);
}

.team__title {
    margin: 0 0 var(--s-1) 0;
    font-size: 1.5rem;
}

.team__subtitle {
    margin: 0;
    color: var(--text-2);
    font-size: 0.95rem;
}

.team__actions {
    margin-bottom: var(--s-4);
}

.team__add-form {
    margin-bottom: var(--s-5);
    padding: var(--s-4);
    background: var(--surface-2);
    border-radius: var(--r-md);
}

.form-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-4);
    margin-bottom: var(--s-3);
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    min-width: 200px;
}

.form-field__label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-2);
}

.form-field__hint {
    font-size: 0.75rem;
    color: var(--text-3);
}

.form .alert {
    margin-bottom: var(--s-3);
}

.team__list-wrap {
    overflow-x: auto;
}

.team-table {
    width: 100%;
    border-collapse: collapse;
}

.team-table th,
.team-table td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--border);
}

.team-table th {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
}

.team-table__actions {
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

.member-name {
    display: block;
    font-weight: 600;
}

.member-meta {
    display: block;
    font-size: 0.875rem;
    color: var(--text-2);
}

.edit-role {
    max-width: 140px;
    margin-right: var(--s-2);
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
