<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

import { computed, onMounted, ref } from "vue"
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

const organizationId = computed(() => org.value?.id ?? "")

const sortedClients = computed(() =>
    [...clients.value].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
)

const filteredClients = computed(() => {
    const needle = search.value.trim().toLowerCase()
    if (!needle) return sortedClients.value
    return sortedClients.value.filter((client) =>
        (client.name ?? "").toLowerCase().includes(needle)
    )
})

const hasClients = computed(() => sortedClients.value.length > 0)

async function loadClients() {
    loading.value = true
    error.value = null
    try {
        const orgs = await organizationsApi.getMine()
        if (!orgs?.length) {
            error.value = { title: "No organization", message: "Create an organization first." }
            return
        }
        org.value = orgs[0]
        if (!org.value?.id) return
        clients.value = await clientsApi.list(org.value.id)
    } catch (e) {
        console.error("Load clients error:", e)
        error.value = toUiError(e)
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
    } catch (e) {
        console.error("Create client error:", e)
        addError.value = toUiError(e)
    } finally {
        addLoading.value = false
    }
}
</script>

<template>
    <section class="card clients">
        <header class="clients__header">
            <div>
                <h1 class="clients__title">Clients</h1>
                <p v-if="org" class="clients__subtitle">{{ org.name }}</p>
            </div>
            <button
                type="button"
                class="btn btn-primary"
                :aria-expanded="showAddForm"
                @click="showAddForm = !showAddForm"
            >
                {{ showAddForm ? "Cancel" : "Add client" }}
            </button>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading && !clients.length">
            <p class="muted">Loading clients...</p>
        </template>

        <template v-else>
            <form v-if="showAddForm" class="clients__add-form" @submit.prevent="onAddClient">
                <div class="clients__add-grid">
                    <label class="form-field">
                        <span class="form-field__label">Client name</span>
                        <input
                            v-model.trim="addForm.name"
                            type="text"
                            required
                            placeholder="Acme Corporation"
                            autocomplete="off"
                        />
                    </label>
                    <button type="submit" class="btn btn-primary" :disabled="addLoading">
                        {{ addLoading ? "Saving..." : "Save client" }}
                    </button>
                </div>
                <div v-if="addError" class="alert alert--inline" role="alert">
                    <div class="alert__title">{{ addError.title }}</div>
                    <div class="alert__msg">{{ addError.message }}</div>
                </div>
            </form>

            <div class="clients__meta">
                <p class="clients__count">
                    {{ filteredClients.length }} of {{ sortedClients.length }} client{{
                        sortedClients.length === 1 ? "" : "s"
                    }}
                </p>
                <input
                    v-model.trim="search"
                    class="clients__search"
                    type="search"
                    placeholder="Search clients"
                    :disabled="!hasClients"
                />
            </div>

            <div v-if="!sortedClients.length" class="clients__empty">
                <h2>No clients yet</h2>
                <p>Add your first client so projects can be linked for reporting.</p>
            </div>

            <ul v-else class="clients__grid">
                <li v-for="client in filteredClients" :key="client.id" class="clients__item">
                    <p class="clients__name">{{ client.name }}</p>
                    <p class="clients__id">{{ client.id }}</p>
                </li>
            </ul>
        </template>
    </section>
</template>

<style scoped>
.clients {
    padding: var(--s-5);
}

.clients__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
}

.clients__title {
    margin: 0 0 var(--s-1) 0;
    font-size: 1.5rem;
}

.clients__subtitle {
    margin: 0;
    color: var(--text-2);
}

.clients__add-form {
    margin-bottom: var(--s-4);
    border: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: var(--r-md);
    padding: var(--s-4);
}

.clients__add-grid {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto;
    gap: var(--s-3);
    align-items: end;
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
}

.form-field__label {
    font-size: 0.875rem;
    color: var(--text-2);
    font-weight: 600;
}

.clients__meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
}

.clients__count {
    margin: 0;
    font-weight: 600;
}

.clients__search {
    width: min(340px, 100%);
}

.clients__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--s-3);
}

.clients__item {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: var(--s-3);
    background: var(--surface);
}

.clients__name {
    margin: 0 0 var(--s-1) 0;
    font-weight: 700;
}

.clients__id {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-3);
    word-break: break-all;
}

.clients__empty {
    border: 1px dashed var(--border);
    border-radius: var(--r-md);
    padding: var(--s-5);
    text-align: center;
}

.clients__empty h2 {
    margin: 0 0 var(--s-2) 0;
    font-size: 1rem;
}

.clients__empty p {
    margin: 0;
    color: var(--text-2);
}

.alert--inline {
    margin-top: var(--s-3);
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@media (max-width: 700px) {
    .clients__add-grid {
        grid-template-columns: 1fr;
    }

    .clients__meta {
        flex-direction: column;
        align-items: stretch;
    }

    .clients__search {
        width: 100%;
    }
}
</style>
