<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref } from "vue"
import ClientsTable from "~/components/clients/Table.vue"
import ProjectsHero from "~/components/projects/Hero.vue"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { clientsApi, type Client, type CreateClientRequest } from "~/api/clientsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const org = ref<Organization | null>(null)
const clients = ref<Client[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)

const showAddForm = ref(false)
const addForm = ref({ name: "" })
const addLoading = ref(false)
const addError = ref<UiError | null>(null)
const search = ref("")
const statusFilter = ref<"active" | "archived" | "all">("active")
const archivedClientIds = ref<string[]>([])
const selectedClientIds = ref<string[]>([])

const organizationId = computed(() => org.value?.id ?? "")

const sortedClients = computed(() =>
    [...clients.value].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
)

const filteredClients = computed(() => {
    const needle = search.value.trim().toLowerCase()
    return sortedClients.value.filter((client) => {
        const isArchived = archivedClientIds.value.includes(client.id)
        if (statusFilter.value === "active" && isArchived) return false
        if (statusFilter.value === "archived" && !isArchived) return false
        if (!needle) return true
        return (client.name ?? "").toLowerCase().includes(needle)
    })
})

const hasClients = computed(() => sortedClients.value.length > 0)
const heroMetrics = computed(() => [
    { label: "Total clients", value: sortedClients.value.length },
    { label: "Visible", value: filteredClients.value.length },
    { label: "Archived", value: archivedClientIds.value.length },
])
const clientRows = computed(() =>
    filteredClients.value.map((client) => ({
        id: client.id,
        name: client.name ?? "Unnamed client",
        meta: "Client record",
        statusLabel: archivedClientIds.value.includes(client.id) ? "Archived" : "Active",
        isArchived: archivedClientIds.value.includes(client.id),
        isSelected: selectedClientIds.value.includes(client.id),
    }))
)
const activeVisibleClientIds = computed(() =>
    filteredClients.value.filter((client) => !archivedClientIds.value.includes(client.id)).map((client) => client.id)
)
const allActiveSelected = computed(() =>
    activeVisibleClientIds.value.length > 0 &&
    activeVisibleClientIds.value.every((id) => selectedClientIds.value.includes(id))
)

async function loadClients() {
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
        if (!org.value?.id) return
        clients.value = await clientsApi.list(org.value.id)
    } catch (cause) {
        console.error("Load clients error:", cause)
        error.value = toUiError(cause)
    } finally {
        loading.value = false
    }
}

onMounted(() => loadClients())

async function onAddClient() {
    addError.value = null
    if (!organizationId.value) {
        addError.value = {
            title: "Missing organization",
            message: "Select an organization before adding a client.",
        }
        return
    }

    const name = addForm.value.name.trim()
    if (!name) {
        addError.value = {
            title: "Missing name",
            message: "Enter a client name before saving.",
        }
        return
    }

    addLoading.value = true
    try {
        const payload: CreateClientRequest = { name }
        await clientsApi.create(organizationId.value, payload)
        addForm.value = { name: "" }
        showAddForm.value = false
        await loadClients()
    } catch (cause) {
        console.error("Create client error:", cause)
        addError.value = toUiError(cause)
    } finally {
        addLoading.value = false
    }
}

function archiveClient(clientId: string) {
    if (archivedClientIds.value.includes(clientId)) return
    archivedClientIds.value = [...archivedClientIds.value, clientId]
    selectedClientIds.value = selectedClientIds.value.filter((id) => id !== clientId)
}

function archiveSelectedClients() {
    const nextIds = activeVisibleClientIds.value.filter((id) => selectedClientIds.value.includes(id))
    if (!nextIds.length) return
    archivedClientIds.value = [...new Set([...archivedClientIds.value, ...nextIds])]
    selectedClientIds.value = selectedClientIds.value.filter((id) => !nextIds.includes(id))
}

function toggleClientSelection(payload: { clientId: string; checked: boolean }) {
    if (archivedClientIds.value.includes(payload.clientId)) return
    if (payload.checked) {
        selectedClientIds.value = [...new Set([...selectedClientIds.value, payload.clientId])]
        return
    }
    selectedClientIds.value = selectedClientIds.value.filter((id) => id !== payload.clientId)
}

function toggleAllClientSelection(checked: boolean) {
    selectedClientIds.value = checked ? [...activeVisibleClientIds.value] : []
}
</script>

<template>
    <section class="clients-page">
        <ProjectsHero
            breadcrumb="Management / Clients"
            title="Clients"
            subtitle="Create client records first so projects and reporting can be linked to the right account."
            :metrics="heroMetrics"
            :can-create="true"
            :create-open="showAddForm"
            create-label="Add Client"
            close-label="Close client form"
            @toggle-create="showAddForm = !showAddForm"
        />

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading && !clients.length">
            <section class="card clients-page__loading">
                <p class="muted">Loading clients workspace...</p>
            </section>
        </template>

        <template v-else>
            <section v-if="showAddForm" class="card clients-create">
                <div class="clients-create__head">
                    <div>
                        <p class="clients-create__eyebrow">Client Setup</p>
                        <h2 class="clients-create__title">Create a new client</h2>
                        <p class="clients-create__subtitle">
                            Add a clear client record before linking projects and time reporting.
                        </p>
                    </div>
                    <button type="button" class="btn btn-secondary" @click="showAddForm = false">
                        Close
                    </button>
                </div>

                <form class="clients-create__form" @submit.prevent="onAddClient">
                    <label class="clients-create__field">
                        <span class="clients-create__label">Client name</span>
                        <input
                            v-model.trim="addForm.name"
                            type="text"
                            required
                            placeholder="Acme Corporation"
                            autocomplete="off"
                        />
                    </label>

                    <div class="clients-create__actions">
                        <button type="button" class="btn btn-secondary" @click="showAddForm = false">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary" :disabled="addLoading">
                            {{ addLoading ? "Saving..." : "Save Client" }}
                        </button>
                    </div>
                </form>

                <div v-if="addError" class="alert alert--inline" role="alert">
                    <div class="alert__title">{{ addError.title }}</div>
                    <div class="alert__msg">{{ addError.message }}</div>
                </div>
            </section>

            <section class="card clients-search">
                <div>
                    <p class="clients-search__label">Search clients</p>
                    <p class="clients-search__summary">
                        {{ filteredClients.length }} of {{ sortedClients.length }} client{{ sortedClients.length === 1 ? "" : "s" }}
                    </p>
                </div>
                <div class="clients-search__controls">
                    <select v-model="statusFilter" class="clients-search__status" :disabled="!hasClients">
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                        <option value="all">All statuses</option>
                    </select>
                    <input
                        v-model.trim="search"
                        class="clients-search__input"
                        type="search"
                        placeholder="Search clients"
                        :disabled="!hasClients"
                    />
                    <button
                        type="button"
                        class="btn btn-secondary"
                        :disabled="!selectedClientIds.length"
                        @click="archiveSelectedClients"
                    >
                        Archive Selected
                    </button>
                </div>
            </section>

            <section v-if="!sortedClients.length" class="card clients-page__empty">
                <p class="clients-page__empty-title">No clients yet</p>
                <p class="muted">Add your first client so projects can be linked for reporting.</p>
            </section>

            <section v-else-if="!filteredClients.length" class="card clients-page__empty">
                <p class="clients-page__empty-title">No clients match this search.</p>
                <p class="muted">Try a broader search term to view more records.</p>
            </section>

            <ClientsTable
                :rows="clientRows"
                :all-active-selected="allActiveSelected"
                @toggle-select-all="toggleAllClientSelection"
                @toggle-select="toggleClientSelection"
                @archive="archiveClient"
            />
        </template>
    </section>
</template>

<style scoped>
.clients-page {
    display: grid;
    gap: var(--s-4);
}

.clients-page__loading,
.clients-page__empty {
    padding: var(--s-5);
}

.clients-page__empty-title {
    margin: 0 0 var(--s-1);
    font-weight: 700;
}

.clients-create,
.clients-search {
    padding: var(--s-4);
}

.clients-create {
    display: grid;
    gap: var(--s-4);
}

.clients-create__head {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
}

.clients-create__eyebrow {
    margin: 0 0 var(--s-1);
    color: var(--text-3);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.clients-create__title {
    margin: 0;
    font-size: 1.35rem;
}

.clients-create__subtitle {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
}

.clients-create__form {
    display: grid;
    gap: var(--s-3);
}

.clients-create__field {
    display: grid;
    gap: 6px;
}

.clients-create__label,
.clients-search__label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
}

.clients-create__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
}

.clients-search {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-3);
}

.clients-search__controls {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    flex-wrap: wrap;
}

.clients-search__summary {
    margin: 6px 0 0;
    color: var(--text-2);
}

.clients-search__status,
.clients-search__input {
    width: min(360px, 100%);
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
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@media (max-width: 820px) {
    .clients-create__head,
    .clients-search,
    .clients-create__actions,
    .clients-search__controls {
        flex-direction: column;
        align-items: flex-start;
    }

    .clients-search__input {
        width: 100%;
    }
}
</style>
