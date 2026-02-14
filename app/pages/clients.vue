<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

import { ref, computed, onMounted } from "vue"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { clientsApi, type Client, type CreateClientRequest } from "~/api/clientsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const org = ref<Organization | null>(null)
const clients = ref<Client[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)

const addForm = ref({ name: "" })
const addLoading = ref(false)
const addError = ref<UiError | null>(null)
const showAddForm = ref(false)

const organizationId = computed(() => org.value?.id ?? "")

const sortedClients = computed(() =>
    [...clients.value].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
)

async function loadClients() {
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
            clients.value = await clientsApi.list(org.value.id)
        }
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
    addLoading.value = true
    try {
        if (!organizationId.value) {
            addError.value = {
                title: "Missing organization",
                message: "Select an organization before adding a client.",
            }
            return
        }
        if (!addForm.value.name.trim()) {
            addError.value = {
                title: "Missing name",
                message: "Enter a client name before saving.",
            }
            return
        }
        const payload: CreateClientRequest = { name: addForm.value.name.trim() }
        await clientsApi.create(organizationId.value, payload)
        await loadClients()
        addForm.value = { name: "" }
        showAddForm.value = false
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
            <h1 class="clients__title">Clients</h1>
            <p v-if="org" class="clients__subtitle">{{ org.name }}</p>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading && !clients.length">
            <p class="muted">Loading clients…</p>
        </template>

        <template v-else>
            <div class="clients__toolbar">
                <p class="clients__count">
                    {{ sortedClients.length }} client{{ sortedClients.length === 1 ? "" : "s" }}
                </p>
                <button
                    type="button"
                    class="btn btn-primary"
                    :aria-expanded="showAddForm"
                    @click="showAddForm = !showAddForm"
                >
                    {{ showAddForm ? "Cancel" : "New client" }}
                </button>
            </div>

            <form v-if="showAddForm" class="clients__add-form form" @submit.prevent="onAddClient">
                <div class="form-row">
                    <label class="form-field">
                        <span class="form-field__label">Client name</span>
                        <input
                            v-model.trim="addForm.name"
                            type="text"
                            required
                            placeholder="Acme Corp"
                            autocomplete="off"
                        />
                    </label>
                </div>
                <div v-if="addError" class="alert" role="alert">
                    <div class="alert__title">{{ addError.title }}</div>
                    <div class="alert__msg">{{ addError.message }}</div>
                </div>
                <button type="submit" class="btn btn-primary" :disabled="addLoading">
                    {{ addLoading ? "Saving…" : "Save client" }}
                </button>
            </form>

            <div class="clients__list">
                <div v-if="!sortedClients.length" class="empty-state">
                    <p class="muted">No clients yet. Add your first client to get started.</p>
                </div>
                <ul v-else class="clients__items">
                    <li v-for="client in sortedClients" :key="client.id" class="clients__item">
                        <div>
                            <div class="clients__name">{{ client.name }}</div>
                            <div v-if="client.id" class="clients__meta">ID: {{ client.id }}</div>
                        </div>
                    </li>
                </ul>
            </div>
        </template>
    </section>
</template>
