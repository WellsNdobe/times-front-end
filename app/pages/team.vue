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
const searchQuery = ref("")

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
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
    return name || member.userId || "Unknown member"
}

const memberSecondaryText = (member: OrganizationMember) => member.userId || "Member record"

const memberInitials = (member: OrganizationMember) => {
    const source = [member.firstName, member.lastName].filter(Boolean) as string[]
    if (!source.length) return (member.userId || "?").slice(0, 2).toUpperCase()
    return source.map((part) => part.charAt(0).toUpperCase()).join("").slice(0, 2)
}

const filteredMembers = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()
    if (!query) return members.value

    return members.value.filter((member) => {
        const haystack = [
            memberDisplayName(member),
            memberSecondaryText(member),
            roleLabelByValue(member.role),
            statusLabel(member),
        ]
            .join(" ")
            .toLowerCase()

        return haystack.includes(query)
    })
})

const activeMembersCount = computed(() => members.value.filter((member) => member.isActive).length)
const inactiveMembersCount = computed(() => members.value.length - activeMembersCount.value)
</script>

<template>
    <section class="team-page">
        <header class="team-page__header">
            <div>
                <h1 class="team-page__title">Team</h1>
                <p v-if="org" class="team-page__subtitle">{{ org.name }} – manage members</p>
            </div>

            <div class="team-page__header-actions">
                <label class="team-search" aria-label="Search team members">
                    <Icon name="mdi:magnify" size="18" class="team-search__icon" aria-hidden="true" />
                    <input
                        v-model.trim="searchQuery"
                        type="search"
                        placeholder="Search members..."
                        autocomplete="off"
                    />
                </label>

                <button
                    type="button"
                    class="btn btn-primary team-page__add-toggle"
                    :aria-expanded="showAddForm"
                    @click="showAddForm = !showAddForm"
                >
                    <Icon name="mdi:plus" size="18" aria-hidden="true" />
                    <span>{{ showAddForm ? "Close" : "Add Member" }}</span>
                </button>
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <section class="team-panel team-panel--empty">
                <Icon name="mdi:account-group-outline" size="32" aria-hidden="true" />
                <p class="muted">Loading team…</p>
            </section>
        </template>

        <template v-else>
            <form v-if="showAddForm" class="team-panel team-add" @submit.prevent="onAddMember">
                <div class="team-add__topbar">
                    <div class="team-add__heading-wrap">
                        <div class="team-add__heading">
                            <span class="team-add__heading-icon">
                                <Icon name="mdi:account-plus-outline" size="20" aria-hidden="true" />
                            </span>
                            <h2>Add Member</h2>
                        </div>

                        <div class="team-add__mode-switch" role="tablist" aria-label="Member creation mode">
                            <button
                                type="button"
                                class="team-add__mode"
                                :class="{ 'team-add__mode--active': addMode === 'existing' }"
                                @click="addMode = 'existing'"
                            >
                                Existing User
                            </button>
                            <button
                                type="button"
                                class="team-add__mode"
                                :class="{ 'team-add__mode--active': addMode === 'create' }"
                                @click="addMode = 'create'"
                            >
                                Create User
                            </button>
                        </div>
                    </div>

                    <button type="button" class="team-add__close" aria-label="Close add member form" @click="showAddForm = false">
                        <Icon name="mdi:close" size="22" aria-hidden="true" />
                    </button>
                </div>

                <div class="team-add__content">
                    <section class="team-add__column" :class="{ 'team-add__column--inactive': addMode !== 'existing' }">
                        <p class="team-add__eyebrow">Add Existing User</p>

                        <label class="team-field">
                            <span class="team-field__label">User ID</span>
                            <input
                                v-model.trim="addForm.userId"
                                type="text"
                                placeholder="e.g. USER-8842"
                                autocomplete="off"
                                :disabled="addMode !== 'existing'"
                            />
                        </label>

                        <p class="team-field__hint">Use the member’s existing profile identifier to add them instantly.</p>
                    </section>

                    <section class="team-add__column" :class="{ 'team-add__column--inactive': addMode !== 'create' }">
                        <p class="team-add__eyebrow">Create New User</p>

                        <div class="team-add__grid">
                            <label class="team-field team-add__grid-span-2">
                                <span class="team-field__label">Email Address</span>
                                <input
                                    v-model.trim="addForm.email"
                                    type="email"
                                    placeholder="email@company.com"
                                    autocomplete="email"
                                    :disabled="addMode !== 'create'"
                                />
                            </label>

                            <label class="team-field">
                                <span class="team-field__label">Role</span>
                                <select v-model.number="addForm.role">
                                    <option v-for="r in roleOptions" :key="r.value" :value="r.value">
                                        {{ r.label }}
                                    </option>
                                </select>
                            </label>

                            <label class="team-field">
                                <span class="team-field__label">First Name</span>
                                <input
                                    v-model.trim="addForm.firstName"
                                    type="text"
                                    placeholder="John"
                                    autocomplete="given-name"
                                    :disabled="addMode !== 'create'"
                                />
                            </label>

                            <label class="team-field">
                                <span class="team-field__label">Last Name</span>
                                <input
                                    v-model.trim="addForm.lastName"
                                    type="text"
                                    placeholder="Doe"
                                    autocomplete="family-name"
                                    :disabled="addMode !== 'create'"
                                />
                            </label>

                            <label class="team-field team-add__grid-span-2">
                                <span class="team-field__label">Temporary Password</span>
                                <input
                                    v-model="addForm.password"
                                    type="password"
                                    placeholder="At least 8 characters"
                                    autocomplete="new-password"
                                    :disabled="addMode !== 'create'"
                                />
                            </label>
                        </div>
                    </section>
                </div>

                <div v-if="addError" class="alert team-add__alert" role="alert">
                    <div class="alert__title">{{ addError.title }}</div>
                    <div class="alert__msg">{{ addError.message }}</div>
                </div>

                <div class="team-add__footer">
                    <div class="team-stats">
                        <div class="team-stats__item">
                            <span class="team-stats__value">{{ members.length }}</span>
                            <span class="team-stats__label">Total members</span>
                        </div>
                        <div class="team-stats__item">
                            <span class="team-stats__value">{{ activeMembersCount }}</span>
                            <span class="team-stats__label">Active</span>
                        </div>
                        <div class="team-stats__item">
                            <span class="team-stats__value">{{ inactiveMembersCount }}</span>
                            <span class="team-stats__label">Inactive</span>
                        </div>
                    </div>

                    <button type="submit" class="btn btn-primary team-add__submit" :disabled="addLoading">
                        {{ addLoading ? "Adding…" : "Add Member" }}
                    </button>
                </div>
            </form>

            <section class="team-panel team-directory">
                <div class="team-directory__head">
                    <div class="team-directory__columns">
                        <span>Member</span>
                        <span>Role</span>
                        <span>Status</span>
                        <span class="team-directory__actions-label">Actions</span>
                    </div>
                </div>

                <div v-if="filteredMembers.length" class="team-directory__body">
                    <article
                        v-for="member in filteredMembers"
                        :key="member.id"
                        class="team-row"
                        :class="{ 'team-row--editing': editingMemberId === member.id }"
                    >
                        <div class="team-row__member">
                            <div class="team-avatar" :class="{ 'team-avatar--inactive': !member.isActive }">
                                {{ memberInitials(member) }}
                            </div>

                            <div class="team-row__identity">
                                <p class="team-row__name">{{ memberDisplayName(member) }}</p>
                                <p class="team-row__meta">{{ memberSecondaryText(member) }}</p>
                            </div>
                        </div>

                        <div class="team-row__role">
                            <template v-if="editingMemberId === member.id">
                                <div class="team-row__edit-stack">
                                    <select v-model.number="editRole" class="team-row__role-select">
                                        <option v-for="r in roleOptions" :key="r.value" :value="r.value">
                                            {{ r.label }}
                                        </option>
                                    </select>

                                    <div class="team-row__edit-actions">
                                        <button
                                            type="button"
                                            class="btn btn-primary btn-sm team-row__save"
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
                                </div>
                            </template>
                            <span v-else class="team-pill">{{ roleLabelByValue(member.role) }}</span>
                        </div>

                        <div class="team-row__status">
                            <span class="team-status" :class="member.isActive ? 'team-status--active' : 'team-status--inactive'">
                                <span class="team-status__dot" aria-hidden="true"></span>
                                {{ statusLabel(member) }}
                            </span>
                        </div>

                        <div class="team-row__actions">
                            <button
                                v-if="editingMemberId !== member.id"
                                type="button"
                                class="team-icon-btn"
                                aria-label="Edit member role"
                                @click="startEdit(member)"
                            >
                                <Icon name="mdi:pencil" size="18" aria-hidden="true" />
                            </button>
                            <span v-else class="team-row__actions-placeholder"></span>
                        </div>
                    </article>
                </div>

                <div v-else class="team-panel team-panel--empty team-directory__empty">
                    <Icon name="mdi:account-search-outline" size="32" aria-hidden="true" />
                    <p class="muted">
                        {{ searchQuery ? "No members match your search." : "No members yet. Add someone above." }}
                    </p>
                </div>

                <footer class="team-directory__footer">
                    <p>Showing {{ filteredMembers.length }} of {{ members.length }} members</p>

                    <div class="team-directory__pager">
                        <button type="button" class="btn btn-secondary btn-sm" disabled>Previous</button>
                        <button type="button" class="btn btn-secondary btn-sm" disabled>Next</button>
                    </div>
                </footer>
            </section>
        </template>
    </section>
</template>

<style scoped>
.team-page {
    display: grid;
    gap: var(--s-5);
    padding: var(--s-5);
}

.team-page__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-4);
}

.team-page__title {
    margin: 0;
    font-size: clamp(2rem, 3vw, 2.65rem);
    line-height: 1.05;
    letter-spacing: -0.04em;
}

.team-page__subtitle {
    margin: var(--s-2) 0 0;
    font-size: 1.15rem;
    color: #60708d;
}

.team-page__header-actions {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex-wrap: wrap;
}

.team-search {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: min(100%, 320px);
    padding: 0 14px;
    background: var(--surface);
    border: 1px solid #d7dfef;
    border-radius: 14px;
    box-shadow: 0 8px 20px rgba(148, 163, 184, 0.08);
}

.team-search:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 4px var(--focus-soft);
}

.team-search__icon {
    color: #8a98b1;
    flex: 0 0 auto;
}

.team-search input {
    width: 100%;
    padding: 13px 0;
    border: 0;
    background: transparent;
    box-shadow: none;
}

.team-page__add-toggle {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding-inline: 20px;
    border-radius: 14px;
    box-shadow: 0 12px 26px rgba(15, 118, 110, 0.22);
}

.team-panel {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #d7dfef;
    border-radius: 18px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.team-panel--empty {
    display: grid;
    place-items: center;
    gap: var(--s-2);
    min-height: 220px;
    padding: var(--s-6);
    color: #7c8aa5;
    text-align: center;
}

.team-add {
    overflow: hidden;
}

.team-add__topbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-3);
    padding: 22px 24px;
    border-bottom: 1px solid #e4ebf5;
}

.team-add__heading-wrap {
    display: grid;
    gap: var(--s-3);
    width: 100%;
}

.team-add__heading {
    display: inline-flex;
    align-items: center;
    gap: 12px;
}

.team-add__heading h2 {
    margin: 0;
    font-size: 1.1rem;
}

.team-add__heading-icon {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    color: var(--primary);
    background: rgba(15, 118, 110, 0.1);
}

.team-add__mode-switch {
    display: inline-flex;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.team-add__mode {
    padding: 10px 16px;
    border: 1px solid #d7dfef;
    border-radius: 999px;
    background: #fff;
    color: #55657f;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}

.team-add__mode--active {
    border-color: transparent;
    background: var(--primary-soft);
    color: var(--primary);
}

.team-add__close {
    display: inline-grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #93a0b7;
    cursor: pointer;
}

.team-add__close:hover {
    background: #f5f7fb;
    color: var(--text-1);
}

.team-add__content {
    display: grid;
    grid-template-columns: minmax(240px, 0.9fr) minmax(360px, 1.6fr);
}

.team-add__column {
    padding: 32px 30px 28px;
}

.team-add__column + .team-add__column {
    border-left: 1px solid #e9eef8;
}

.team-add__column--inactive {
    background: linear-gradient(180deg, rgba(248, 250, 253, 0.9), rgba(248, 250, 253, 0.55));
}

.team-add__eyebrow {
    margin: 0 0 24px;
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8da0bc;
}

.team-add__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 20px;
}

.team-add__grid-span-2 {
    grid-column: span 2;
}

.team-field {
    display: grid;
    gap: 10px;
}

.team-field__label {
    font-size: 0.95rem;
    font-weight: 600;
    color: #1b2840;
}

.team-field input,
.team-field select {
    min-height: 50px;
    padding: 12px 16px;
    border-radius: 14px;
    border-color: #d7dfef;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.team-field__hint {
    margin: 14px 0 0;
    max-width: 30ch;
    font-size: 0.9rem;
    line-height: 1.6;
    color: #7e8da7;
}

.team-add__alert {
    margin: 0 24px;
}

.team-add__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    padding: 24px 30px 30px;
    border-top: 1px solid #e9eef8;
}

.team-stats {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
}

.team-stats__item {
    display: grid;
    gap: 2px;
    min-width: 90px;
}

.team-stats__value {
    font-size: 1.15rem;
    font-weight: 700;
    color: #142033;
}

.team-stats__label {
    font-size: 0.84rem;
    color: #7e8da7;
}

.team-add__submit {
    min-width: 190px;
    min-height: 50px;
    border-radius: 12px;
}

.team-directory {
    overflow: hidden;
}

.team-directory__head {
    padding: 20px 32px;
    border-bottom: 1px solid #e6edf7;
}

.team-directory__columns,
.team-row {
    display: grid;
    grid-template-columns: minmax(300px, 1.8fr) minmax(150px, 1fr) minmax(140px, 1fr) 86px;
    gap: 20px;
    align-items: center;
}

.team-directory__columns {
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #60708d;
}

.team-directory__actions-label {
    text-align: right;
}

.team-row {
    padding: 20px 32px;
    border-bottom: 1px solid #edf2f8;
}

.team-row--editing {
    background: linear-gradient(180deg, rgba(246, 251, 250, 0.95), rgba(248, 251, 255, 0.95));
}

.team-row__member {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
}

.team-avatar {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, #f3d6bf, #d8eff0);
    color: #1a2b45;
    font-weight: 700;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
}

.team-avatar--inactive {
    background: linear-gradient(135deg, #edf1f7, #dbe3ef);
    color: #8290a8;
}

.team-row__identity {
    min-width: 0;
}

.team-row__name,
.team-row__meta {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.team-row__name {
    font-size: 1.05rem;
    font-weight: 700;
    color: #182335;
}

.team-row__meta {
    margin-top: 4px;
    font-size: 0.98rem;
    color: #71819c;
}

.team-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 92px;
    padding: 8px 14px;
    border-radius: 999px;
    background: #f1f5fb;
    color: #425570;
    font-weight: 700;
}

.team-row__edit-stack {
    display: grid;
    gap: 10px;
}

.team-row__role-select {
    max-width: 160px;
    min-height: 38px;
    border-radius: 12px;
    color: var(--primary);
    border-color: rgba(15, 118, 110, 0.4);
}

.team-row__edit-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.team-row__save {
    min-width: 90px;
}

.team-status {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-weight: 500;
    color: #22314c;
}

.team-status__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: currentColor;
}

.team-status--active {
    color: #12b981;
}

.team-status--inactive {
    color: #c5cedd;
}

.team-row__actions {
    display: flex;
    justify-content: flex-end;
}

.team-row__actions-placeholder {
    display: inline-block;
    width: 38px;
    height: 38px;
}

.team-icon-btn {
    display: inline-grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #8ea0bb;
    cursor: pointer;
}

.team-icon-btn:hover {
    background: #f3f6fb;
    color: var(--primary);
}

.team-directory__empty {
    margin: 20px;
    min-height: 180px;
    border: 1px dashed #d9e2ef;
    box-shadow: none;
}

.team-directory__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: 20px 32px;
    color: #60708d;
}

.team-directory__footer p {
    margin: 0;
}

.team-directory__pager {
    display: flex;
    gap: 10px;
}

.btn-sm {
    padding: 8px 12px;
    font-size: 0.875rem;
}

.alert--inline {
    margin-top: 2px;
    padding: 10px 12px;
    font-size: 0.875rem;
}

.muted {
    margin: 0;
    color: #7c8aa5;
}

@media (max-width: 1100px) {
    .team-add__content,
    .team-directory__columns,
    .team-row {
        grid-template-columns: 1fr;
    }

    .team-add__column + .team-add__column {
        border-top: 1px solid #e9eef8;
        border-left: 0;
    }

    .team-directory__head {
        display: none;
    }

    .team-row {
        gap: 14px;
        justify-items: start;
    }

    .team-row__actions {
        justify-content: start;
    }
}

@media (max-width: 820px) {
    .team-page {
        padding: var(--s-4);
    }

    .team-page__header,
    .team-add__footer,
    .team-directory__footer {
        flex-direction: column;
        align-items: stretch;
    }

    .team-page__header-actions {
        width: 100%;
    }

    .team-search {
        min-width: 0;
        width: 100%;
    }

    .team-page__add-toggle,
    .team-add__submit {
        width: 100%;
        justify-content: center;
    }

    .team-add__topbar,
    .team-directory__head,
    .team-row,
    .team-directory__footer {
        padding-inline: 20px;
    }

    .team-add__column {
        padding: 24px 20px;
    }

    .team-add__grid {
        grid-template-columns: 1fr;
    }

    .team-add__grid-span-2 {
        grid-column: auto;
    }
}
</style>
