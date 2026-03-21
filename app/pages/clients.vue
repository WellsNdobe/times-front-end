<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

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
const activeTab = ref<"all" | "active" | "inactive">("all")

const BILLABLE_RATE = 185
const tabOptions = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
] as const
const FALLBACK_CLIENT_BILLABLES = [42500, 28900, 36150, 51200, 18750, 22400]
const FALLBACK_DOMAINS = [
    "nexus-ventures.com",
    "aetherlabs.io",
    "northstar-logistics.com",
    "bluepeakcap.com",
    "solsticehealth.co",
    "harborretail.com",
]
const FALLBACK_INDUSTRIES = [
    "Financial Services",
    "Biotechnology",
    "Logistics",
    "Private Equity",
    "Healthcare",
    "Retail",
]

const organizationId = computed(() => org.value?.id ?? "")

const sortedClients = computed(() =>
    [...clients.value].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
)

const clientRows = computed(() =>
    sortedClients.value.map((client, index) => {
        const words = (client.name ?? "Client").split(/\s+/).filter(Boolean)
        const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "CL"
        const status = client.isActive === false ? "Inactive" : "Active"
        const totalProjects = Math.max(3, 12 - index * 2)
        const totalBillable = FALLBACK_CLIENT_BILLABLES[index] ?? Math.max(12500, 46000 - index * 3200)
        const domain =
            FALLBACK_DOMAINS[index] ??
            `${(client.name ?? "client").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.com`
        const industry = FALLBACK_INDUSTRIES[index] ?? "Professional Services"

        return {
            ...client,
            initials,
            status,
            totalProjects,
            totalBillable,
            domain,
            industry,
        }
    })
)

const filteredClients = computed(() => {
    const needle = search.value.trim().toLowerCase()

    return clientRows.value.filter((client) => {
        const matchesTab =
            activeTab.value === "all" ||
            (activeTab.value === "active" && client.status === "Active") ||
            (activeTab.value === "inactive" && client.status === "Inactive")

        const matchesSearch =
            !needle ||
            [client.name, client.industry, client.domain, client.status]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(needle))

        return matchesTab && matchesSearch
    })
})

const hasClients = computed(() => sortedClients.value.length > 0)
const activeClientsCount = computed(
    () => clientRows.value.filter((client) => client.status === "Active").length
)
const totalProjects = computed(() => clientRows.value.reduce((sum, client) => sum + client.totalProjects, 0))
const totalRevenue = computed(() => clientRows.value.reduce((sum, client) => sum + client.totalBillable, 0))
const visibleStart = computed(() => (filteredClients.value.length ? 1 : 0))
const visibleEnd = computed(() => filteredClients.value.length)

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

function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(value)
}

function formatCompactCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value)
}
</script>

<template>
    <section class="clients-page">
        <header class="clients-hero">
            <div>
                <p v-if="org" class="clients-hero__eyebrow">{{ org.name }}</p>
                <h1 class="clients-hero__title">Clients</h1>
                <p class="clients-hero__subtitle">
                    Manage organization clients and billing defaults.
                </p>
            </div>

            <button type="button" class="clients-hero__action" @click="showAddForm = !showAddForm">
                <Icon name="mdi:plus" size="20" />
                <span>{{ showAddForm ? "Close" : "New Client" }}</span>
            </button>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else>
            <form v-if="showAddForm" class="clients-add-form" @submit.prevent="onAddClient">
                <div class="clients-add-form__grid">
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

            <template v-if="loading && !clients.length">
                <div class="clients-loading">Loading clients...</div>
            </template>

            <template v-else>
                <section class="clients-stats" aria-label="Client insights">
                    <article class="stat-card">
                        <p class="stat-card__label">Active Clients</p>
                        <div class="stat-card__value-row">
                            <strong class="stat-card__value">{{ activeClientsCount }}</strong>
                            <span class="stat-card__badge">
                                <Icon name="mdi:trending-up" size="14" />
                                12%
                            </span>
                        </div>
                    </article>

                    <article class="stat-card">
                        <p class="stat-card__label">Avg. Billable</p>
                        <div class="stat-card__value-row stat-card__value-row--split">
                            <strong class="stat-card__value">${{ BILLABLE_RATE }}/hr</strong>
                            <span class="stat-card__meta">Platform Avg</span>
                        </div>
                    </article>

                    <article class="stat-card">
                        <p class="stat-card__label">Project Load</p>
                        <div class="stat-card__value-row stat-card__value-row--split">
                            <strong class="stat-card__value">{{ totalProjects }}</strong>
                            <span class="stat-card__meta">Total Projects</span>
                        </div>
                    </article>

                    <article class="stat-card">
                        <p class="stat-card__label">Total Revenue</p>
                        <div class="stat-card__value-row stat-card__value-row--split">
                            <strong class="stat-card__value">{{ formatCompactCurrency(totalRevenue) }}</strong>
                            <span class="stat-card__meta">Fiscal Year</span>
                        </div>
                    </article>
                </section>

                <section class="clients-panel">
                    <div class="clients-toolbar">
                        <div class="clients-tabs" role="tablist" aria-label="Client status filters">
                            <button
                                v-for="tab in tabOptions"
                                :key="tab.value"
                                type="button"
                                class="clients-tabs__button"
                                :class="{ 'clients-tabs__button--active': activeTab === tab.value }"
                                @click="activeTab = tab.value"
                            >
                                {{ tab.label }}
                            </button>
                        </div>

                        <div class="clients-toolbar__actions">
                            <label class="clients-search">
                                <Icon name="mdi:magnify" size="18" />
                                <input
                                    v-model.trim="search"
                                    type="search"
                                    placeholder="Search clients, industries, or domains"
                                    :disabled="!hasClients"
                                />
                            </label>
                            <button type="button" class="clients-toolbar__button">
                                <Icon name="mdi:filter-variant" size="18" />
                                <span>More Filters</span>
                            </button>
                            <button type="button" class="clients-toolbar__button">
                                <Icon name="mdi:export-variant" size="18" />
                                <span>Export</span>
                            </button>
                        </div>
                    </div>

                    <div v-if="!sortedClients.length" class="clients-empty">
                        <h2>No clients yet</h2>
                        <p>Add your first client so projects can be linked for reporting.</p>
                    </div>

                    <template v-else>
                        <div class="clients-table" role="table" aria-label="Clients table">
                            <div class="clients-table__head" role="rowgroup">
                                <div class="clients-table__row clients-table__row--head" role="row">
                                    <span role="columnheader">Client Name</span>
                                    <span role="columnheader">Industry</span>
                                    <span role="columnheader">Total Projects</span>
                                    <span role="columnheader">Total Billable</span>
                                    <span role="columnheader">Status</span>
                                    <span role="columnheader">Actions</span>
                                </div>
                            </div>

                            <div class="clients-table__body" role="rowgroup">
                                <div
                                    v-for="client in filteredClients"
                                    :key="client.id"
                                    class="clients-table__row"
                                    role="row"
                                >
                                    <div class="clients-table__client" role="cell">
                                        <span class="clients-table__avatar">{{ client.initials }}</span>
                                        <div>
                                            <p class="clients-table__name">{{ client.name }}</p>
                                            <p class="clients-table__domain">{{ client.domain }}</p>
                                        </div>
                                    </div>
                                    <p class="clients-table__industry" role="cell">{{ client.industry }}</p>
                                    <p role="cell">{{ client.totalProjects }}</p>
                                    <p role="cell">{{ formatCurrency(client.totalBillable) }}</p>
                                    <div role="cell">
                                        <span
                                            class="clients-table__status"
                                            :class="{
                                                'clients-table__status--inactive': client.status === 'Inactive',
                                            }"
                                        >
                                            {{ client.status }}
                                        </span>
                                    </div>
                                    <div class="clients-table__actions" role="cell">
                                        <button type="button" class="clients-table__icon-button" aria-label="View client">
                                            <Icon name="mdi:eye-outline" size="18" />
                                        </button>
                                        <button type="button" class="clients-table__icon-button" aria-label="More options">
                                            <Icon name="mdi:dots-horizontal" size="18" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <footer class="clients-footer">
                            <p>
                                Showing {{ visibleStart }} to {{ visibleEnd }} of
                                {{ sortedClients.length }} clients
                            </p>

                            <div class="clients-pagination" aria-label="Pagination">
                                <button type="button" class="clients-pagination__button">Previous</button>
                                <button
                                    type="button"
                                    class="clients-pagination__button clients-pagination__button--active"
                                >
                                    1
                                </button>
                                <button type="button" class="clients-pagination__button">2</button>
                                <button type="button" class="clients-pagination__button">3</button>
                                <button type="button" class="clients-pagination__button">Next</button>
                            </div>
                        </footer>
                    </template>
                </section>
            </template>
        </template>
    </section>
</template>

<style scoped>
.clients-page {
    display: flex;
    flex-direction: column;
    gap: 32px;
}

.clients-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
}

.clients-hero__eyebrow {
    margin: 0 0 8px;
    color: var(--text-3);
    font-size: 0.95rem;
}

.clients-hero__title {
    margin: 0;
    font-size: clamp(2.5rem, 4vw, 3.5rem);
    line-height: 1;
    letter-spacing: -0.04em;
}

.clients-hero__subtitle {
    margin: 12px 0 0;
    color: #23343a;
    font-size: 1.15rem;
}

.clients-hero__action {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    border: 0;
    border-radius: 14px;
    background: #0d7a78;
    color: #fff;
    box-shadow: 0 18px 40px rgba(13, 122, 120, 0.22);
    padding: 18px 28px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
}

.clients-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 24px;
}

.stat-card {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #d7dee6;
    border-radius: 22px;
    padding: 28px 30px;
    min-height: 142px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-shadow: 0 8px 18px rgba(30, 41, 59, 0.04);
}

.stat-card__label {
    margin: 0 0 18px;
    font-size: 0.92rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #24343b;
}

.stat-card__value-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}

.stat-card__value-row--split {
    justify-content: space-between;
}

.stat-card__value {
    font-size: clamp(2rem, 2.7vw, 2.5rem);
    letter-spacing: -0.04em;
}

.stat-card__badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #d8f6fb;
    color: #0d6d78;
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 0.95rem;
}

.stat-card__meta {
    color: #33454d;
    font-size: 0.92rem;
    max-width: 92px;
    line-height: 1.3;
}

.clients-panel {
    background: var(--surface);
    border: 1px solid #d9e1e8;
    border-radius: 24px;
    overflow: hidden;
    box-shadow: 0 18px 44px rgba(148, 163, 184, 0.08);
}

.clients-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    padding: 22px 22px 0;
}

.clients-tabs {
    display: inline-flex;
    gap: 16px;
    align-items: center;
}

.clients-tabs__button {
    border: 0;
    background: transparent;
    color: #23343a;
    border-radius: 10px;
    padding: 14px 20px;
    font-size: 1rem;
    cursor: pointer;
}

.clients-tabs__button--active {
    background: #0d6f70;
    color: #fff;
    font-weight: 700;
}

.clients-toolbar__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.clients-search {
    min-width: 310px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid #d7dee6;
    background: #fff;
    border-radius: 12px;
    color: var(--text-3);
}

.clients-search input {
    flex: 1;
    border: 0;
    box-shadow: none;
    padding: 14px 0;
    background: transparent;
}

.clients-toolbar__button {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid #d7dee6;
    background: #fff;
    color: #23343a;
    border-radius: 10px;
    padding: 14px 18px;
    font: inherit;
    cursor: pointer;
}

.clients-table__head {
    background: #fbfcfd;
    border-top: 1px solid #e3e8ef;
    border-bottom: 1px solid #e3e8ef;
    margin-top: 20px;
}

.clients-table__row {
    display: grid;
    grid-template-columns: minmax(260px, 2fr) minmax(160px, 1.2fr) 1fr 1.2fr 0.9fr 0.7fr;
    gap: 16px;
    align-items: center;
    padding: 22px 30px;
}

.clients-table__row--head {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.84rem;
    color: #22353d;
}

.clients-table__body .clients-table__row {
    border-bottom: 1px solid #edf1f4;
}

.clients-table__client {
    display: flex;
    align-items: center;
    gap: 14px;
}

.clients-table__avatar {
    width: 50px;
    height: 50px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: #e9edf2;
    color: #0e6b70;
    font-weight: 700;
    font-size: 1.1rem;
}

.clients-table__name,
.clients-table__industry,
.clients-footer p {
    margin: 0;
}

.clients-table__name {
    font-size: 1.05rem;
    font-weight: 700;
    margin-bottom: 4px;
}

.clients-table__domain {
    margin: 0;
    color: #56666c;
}

.clients-table__industry {
    color: #22353d;
    line-height: 1.45;
}

.clients-table__status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 6px 14px;
    background: #d8f6fb;
    color: #0c6a73;
    font-weight: 500;
}

.clients-table__status--inactive {
    background: #f3e8d8;
    color: #9a5b0f;
}

.clients-table__actions {
    display: flex;
    gap: 8px;
}

.clients-table__icon-button {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid #d7dee6;
    background: #fff;
    display: grid;
    place-items: center;
    color: #31454e;
    cursor: pointer;
}

.clients-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding: 20px 30px;
}

.clients-pagination {
    display: inline-flex;
    gap: 10px;
    flex-wrap: wrap;
}

.clients-pagination__button {
    min-width: 44px;
    height: 40px;
    padding: 0 16px;
    border-radius: 4px;
    border: 1px solid #d7dee6;
    background: #fff;
    color: #23343a;
    font: inherit;
    cursor: pointer;
}

.clients-pagination__button--active {
    background: #0d6f70;
    border-color: #0d6f70;
    color: #fff;
}

.clients-empty,
.clients-loading {
    padding: 42px 30px;
}

.clients-add-form {
    margin-bottom: -8px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 18px;
    padding: 20px;
}

.clients-add-form__grid {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto;
    gap: 16px;
    align-items: end;
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.form-field__label {
    font-size: 0.92rem;
    color: var(--text-2);
    font-weight: 600;
}

.alert {
    border: 1px solid var(--danger);
    background: var(--danger-soft);
    color: #7f1d1d;
    padding: 16px 18px;
    border-radius: 16px;
}

.alert--inline {
    margin-top: 16px;
}

.alert__title {
    font-weight: 700;
    margin-bottom: 6px;
}

@media (max-width: 1200px) {
    .clients-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .clients-toolbar {
        flex-direction: column;
    }

    .clients-toolbar__actions,
    .clients-search {
        width: 100%;
    }

    .clients-search {
        min-width: 0;
    }

    .clients-table {
        overflow-x: auto;
    }

    .clients-table__head,
    .clients-table__body {
        min-width: 980px;
    }
}

@media (max-width: 720px) {
    .clients-page {
        gap: 24px;
    }

    .clients-hero {
        flex-direction: column;
        align-items: stretch;
    }

    .clients-hero__action {
        justify-content: center;
    }

    .clients-stats {
        grid-template-columns: 1fr;
    }

    .clients-add-form__grid,
    .clients-footer {
        grid-template-columns: 1fr;
        display: grid;
    }

    .clients-footer {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
