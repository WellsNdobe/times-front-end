<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { ref, computed, onMounted } from "vue"
import {
    organizationsApi,
    type Organization,
    type OrganizationMember,
    type AddMemberRequest,
    type CreateUserMemberRequest,
    type UpdateMemberRequest,
} from "~/api/organizationsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const org = ref<Organization | null>(null)
const members = ref<OrganizationMember[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)

const addMode = ref<"existing" | "create">("create")
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

const organizationId = computed(() => org.value?.id ?? "")

async function loadTeam() {
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
            members.value = await organizationsApi.getMembers(org.value.id)
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
                    title: "Missing user identifier",
                    message: "Enter a valid profile identifier before adding an existing user.",
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
    return name || "Unknown member"
}
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
                            Ask the user for their profile identifier if they already have an account.
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
                            <th class="team-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="member in members" :key="member.id">
                            <td>
                                <span class="member-name">{{ memberDisplayName(member) }}</span>
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

.member-name {
    display: block;
    font-weight: 600;
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
