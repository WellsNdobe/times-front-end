<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref, watch } from "vue"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { clientsApi, type Client, type CreateClientRequest } from "~/api/clientsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

type ClientUiOverride = {
    industry: string
    domain: string
    totalProjects: number
    totalBillable: number
    isActive: boolean
}

const org = ref<Organization | null>(null)
const clients = ref<Client[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)

const showAddForm = ref(false)
const addForm = ref({
    name: "",
    domain: "",
    industry: "",
    totalProjects: 1,
    totalBillable: 0,
    isActive: true,
})
const addLoading = ref(false)
const addError = ref<UiError | null>(null)
const search = ref("")
const activeTab = ref<"all" | "active" | "inactive">("all")
const showFilters = ref(false)
const selectedIndustry = ref("")
const page = ref(1)
const pageSize = 8
const openMenuClientId = ref("")

const clientUiOverrides = ref<Record<string, ClientUiOverride>>({})

const tabOptions = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
] as const

const organizationId = computed(() => org.value?.id ?? "")

const sortedClients = computed(() =>
    [...clients.value].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
)

const clientRows = computed(() =>
    sortedClients.value.map((client) => {
        const words = (client.name ?? "Client").split(/\s+/).filter(Boolean)
        const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "CL"
        const override = clientUiOverrides.value[client.id]
        const status = (override?.isActive ?? client.isActive ?? true) ? "Active" : "Inactive"
        const totalProjects =
            override?.totalProjects ??
            toPositiveNumber((client as Record<string, unknown>).totalProjects, 0)
        const totalBillable =
            override?.totalBillable ??
            toPositiveNumber((client as Record<string, unknown>).totalBillable, 0)
        const domain =
            override?.domain ??
            toNonEmptyString((client as Record<string, unknown>).domain) ??
            ""
        const industry =
            override?.industry ??
            toNonEmptyString((client as Record<string, unknown>).industry) ??
            ""

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

const uniqueIndustries = computed(() => {
    const items = new Set<string>()
    for (const client of clientRows.value) {
        if (client.industry) items.add(client.industry)
    }
    return [...items].sort((a, b) => a.localeCompare(b))
})

const filteredClients = computed(() => {
    const needle = search.value.trim().toLowerCase()

    return clientRows.value.filter((client) => {
        const matchesTab =
            activeTab.value === "all" ||
            (activeTab.value === "active" && client.status === "Active") ||
            (activeTab.value === "inactive" && client.status === "Inactive")
        const matchesIndustry = !selectedIndustry.value || client.industry === selectedIndustry.value
        const matchesSearch =
            !needle ||
            [client.name, client.industry, client.domain, client.status]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(needle))

        return matchesTab && matchesIndustry && matchesSearch
    })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredClients.value.length / pageSize)))
const paginatedClients = computed(() => {
    const start = (page.value - 1) * pageSize
    return filteredClients.value.slice(start, start + pageSize)
})
const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1))

const hasClients = computed(() => sortedClients.value.length > 0)
const averageBillable = computed(() => {
    const billableClients = clientRows.value.filter((client) => client.totalBillable > 0)
    if (!billableClients.length) return 0
    const total = billableClients.reduce((sum, client) => sum + client.totalBillable, 0)
    return total / billableClients.length
})
const activeClientsCount = computed(
    () => clientRows.value.filter((client) => client.status === "Active").length
)
const totalProjects = computed(() => clientRows.value.reduce((sum, client) => sum + client.totalProjects, 0))
const totalRevenue = computed(() => clientRows.value.reduce((sum, client) => sum + client.totalBillable, 0))
const visibleStart = computed(() => (paginatedClients.value.length ? (page.value - 1) * pageSize + 1 : 0))
const visibleEnd = computed(() =>
    paginatedClients.value.length ? visibleStart.value + paginatedClients.value.length - 1 : 0
)

watch([search, activeTab, selectedIndustry], () => {
    page.value = 1
    openMenuClientId.value = ""
})

watch(totalPages, (next) => {
    if (page.value > next) page.value = next
})

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
        loadClientOverrides()
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
    const domain = addForm.value.domain.trim().toLowerCase()
    const industry = addForm.value.industry.trim()
    if (!name) {
        addError.value = {
            title: "Missing name",
            message: "Enter a client name before saving.",
        }
        return
    }
    if (!domain) {
        addError.value = {
            title: "Missing domain",
            message: "Enter a domain before saving.",
        }
        return
    }
    if (!industry) {
        addError.value = {
            title: "Missing industry",
            message: "Enter an industry before saving.",
        }
        return
    }
    if (!Number.isFinite(addForm.value.totalProjects) || addForm.value.totalProjects < 1) {
        addError.value = {
            title: "Invalid total projects",
            message: "Total projects must be at least 1.",
        }
        return
    }
    if (!Number.isFinite(addForm.value.totalBillable) || addForm.value.totalBillable < 0) {
        addError.value = {
            title: "Invalid total billable",
            message: "Total billable must be 0 or more.",
        }
        return
    }

    addLoading.value = true
    try {
        const payload: CreateClientRequest = { name }
        const created = await clientsApi.create(organizationId.value, payload)
        await loadClients()
        const createdClientId =
            created?.id ??
            clients.value.find((client) => client.name?.trim().toLowerCase() === name.toLowerCase())?.id ??
            ""
        if (createdClientId) {
            clientUiOverrides.value[createdClientId] = {
                domain,
                industry,
                totalProjects: Math.floor(addForm.value.totalProjects),
                totalBillable: Number(addForm.value.totalBillable),
                isActive: addForm.value.isActive,
            }
            persistClientOverrides()
        }

        addForm.value = {
            name: "",
            domain: "",
            industry: "",
            totalProjects: 1,
            totalBillable: 0,
            isActive: true,
        }
        showAddForm.value = false
    } catch (e) {
        console.error("Create client error:", e)
        addError.value = toUiError(e)
    } finally {
        addLoading.value = false
    }
}

function toggleClientMenu(clientId: string) {
    openMenuClientId.value = openMenuClientId.value === clientId ? "" : clientId
}

function toggleClientStatus(
    client: Client & {
        status: string
        industry: string
        domain: string
        totalProjects: number
        totalBillable: number
    }
) {
    clientUiOverrides.value[client.id] = {
        domain: client.domain,
        industry: client.industry,
        totalProjects: client.totalProjects,
        totalBillable: client.totalBillable,
        isActive: client.status !== "Active",
    }
    persistClientOverrides()
    openMenuClientId.value = ""
}

function goToClientReports(clientId: string) {
    openMenuClientId.value = ""
    void navigateTo({ path: "/reports", query: { clientId } })
}

function toggleFilters() {
    showFilters.value = !showFilters.value
}

function clearExtraFilters() {
    selectedIndustry.value = ""
    showFilters.value = false
}

function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages.value) return
    page.value = nextPage
}

function previousPage() {
    goToPage(page.value - 1)
}

function nextPage() {
    goToPage(page.value + 1)
}

function exportVisibleClientsCsv() {
    const lines = filteredClients.value.map((client) => [
        client.name ?? "",
        client.domain,
        client.industry,
        client.totalProjects,
        client.totalBillable,
        client.status,
    ])

    const csv = [
        ["client_name", "domain", "industry", "total_projects", "total_billable", "status"],
        ...lines,
    ]
        .map((line) => line.map((value) => toCsvValue(value)).join(","))
        .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", "clients.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

function toPositiveNumber(value: unknown, fallback: number) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed >= 0) return parsed
    }
    return fallback
}

function toNonEmptyString(value: unknown) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
}

function toCsvValue(value: string | number) {
    const text = String(value)
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replaceAll("\"", "\"\"")}"`
    }
    return text
}

function overrideStorageKey() {
    if (!organizationId.value) return ""
    return `clients-ui-overrides:${organizationId.value}`
}

function loadClientOverrides() {
    if (typeof window === "undefined") return
    const key = overrideStorageKey()
    if (!key) return
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) {
            clientUiOverrides.value = {}
            return
        }
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") {
            clientUiOverrides.value = parsed as Record<string, ClientUiOverride>
        }
    } catch {
        clientUiOverrides.value = {}
    }
}

function persistClientOverrides() {
    if (typeof window === "undefined") return
    const key = overrideStorageKey()
    if (!key) return
    window.localStorage.setItem(key, JSON.stringify(clientUiOverrides.value))
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
                    <label class="form-field">
                        <span class="form-field__label">Domain</span>
                        <input v-model.trim="addForm.domain" type="text" required placeholder="acme.com" autocomplete="off" />
                    </label>
                    <label class="form-field">
                        <span class="form-field__label">Industry</span>
                        <input
                            v-model.trim="addForm.industry"
                            type="text"
                            required
                            placeholder="Professional Services"
                            autocomplete="off"
                        />
                    </label>
                    <label class="form-field">
                        <span class="form-field__label">Total projects</span>
                        <input v-model.number="addForm.totalProjects" type="number" min="1" required />
                    </label>
                    <label class="form-field">
                        <span class="form-field__label">Total billable</span>
                        <input v-model.number="addForm.totalBillable" type="number" min="0" step="0.01" required />
                    </label>
                    <label class="form-field">
                        <span class="form-field__label">Status</span>
                        <select v-model="addForm.isActive" required>
                            <option :value="true">Active</option>
                            <option :value="false">Inactive</option>
                        </select>
                    </label>
                </div>
                <div class="clients-add-form__actions">
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
                            <strong class="stat-card__value">{{ formatCompactCurrency(averageBillable) }}</strong>
                            <span class="stat-card__meta">Client Avg</span>
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
                            <button
                                type="button"
                                class="clients-toolbar__button"
                                :disabled="!hasClients"
                                @click="toggleFilters"
                            >
                                <Icon name="mdi:filter-variant" size="18" />
                                <span>{{ showFilters ? "Hide Filters" : "More Filters" }}</span>
                            </button>
                            <button
                                type="button"
                                class="clients-toolbar__button"
                                :disabled="!hasClients"
                                @click="exportVisibleClientsCsv"
                            >
                                <Icon name="mdi:export-variant" size="18" />
                                <span>Export</span>
                            </button>
                        </div>
                    </div>

                    <div v-if="showFilters" class="clients-filters">
                        <label class="form-field">
                            <span class="form-field__label">Industry</span>
                            <select v-model="selectedIndustry">
                                <option value="">All industries</option>
                                <option v-for="industry in uniqueIndustries" :key="industry" :value="industry">
                                    {{ industry }}
                                </option>
                            </select>
                        </label>
                        <button type="button" class="btn btn-secondary" @click="clearExtraFilters">Clear filters</button>
                    </div>

                    <div v-if="!sortedClients.length" class="clients-empty">
                        <h2>No clients yet</h2>
                        <p>Add your first client so projects can be linked for reporting.</p>
                    </div>

                    <div v-else-if="!filteredClients.length" class="clients-empty">
                        <h2>No matching clients</h2>
                        <p>Try adjusting search or filters.</p>
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
                                    v-for="client in paginatedClients"
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
                                    <p role="cell">
                                        {{ formatCurrency(client.totalBillable) }}
                                    </p>
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
                                        <button
                                            type="button"
                                            class="clients-table__icon-button"
                                            aria-label="View client"
                                            @click="goToClientReports(client.id)"
                                        >
                                            <Icon name="mdi:eye-outline" size="18" />
                                        </button>
                                        <div class="clients-table__menu">
                                            <button
                                                type="button"
                                                class="clients-table__icon-button"
                                                aria-label="More options"
                                                @click="toggleClientMenu(client.id)"
                                            >
                                                <Icon name="mdi:dots-horizontal" size="18" />
                                            </button>
                                            <div v-if="openMenuClientId === client.id" class="clients-table__menu-panel">
                                                <button type="button" @click="goToClientReports(client.id)">Open reports</button>
                                                <button type="button" @click="toggleClientStatus(client)">
                                                    {{ client.status === "Active" ? "Mark inactive" : "Mark active" }}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <footer class="clients-footer">
                            <p>
                                Showing {{ visibleStart }} to {{ visibleEnd }} of
                                {{ filteredClients.length }} matching clients
                            </p>

                            <div class="clients-pagination" aria-label="Pagination">
                                <button
                                    type="button"
                                    class="clients-pagination__button"
                                    :disabled="page === 1"
                                    @click="previousPage"
                                >
                                    Previous
                                </button>
                                <button
                                    v-for="n in pageNumbers"
                                    :key="n"
                                    type="button"
                                    class="clients-pagination__button"
                                    :class="{ 'clients-pagination__button--active': page === n }"
                                    @click="goToPage(n)"
                                >
                                    {{ n }}
                                </button>
                                <button
                                    type="button"
                                    class="clients-pagination__button"
                                    :disabled="page === totalPages"
                                    @click="nextPage"
                                >
                                    Next
                                </button>
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
    gap: var(--s-4);
}

.clients-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--s-4);
}

.clients-hero__eyebrow {
    margin: 0 0 var(--s-1);
    color: var(--text-3);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
}

.clients-hero__title {
    margin: 0;
    font-size: clamp(1.4rem, 3vw, 2rem);
    line-height: 1.2;
    letter-spacing: 0;
}

.clients-hero__subtitle {
    margin: var(--s-1) 0 0;
    color: var(--text-2);
    font-size: 0.9rem;
}

.clients-hero__action {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    border: 0;
    border-radius: var(--r-sm);
    background: var(--primary);
    color: #fff;
    box-shadow: none;
    padding: 10px 14px;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
}

.clients-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--s-3);
}

.stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: var(--s-4);
    min-height: 142px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-shadow: var(--shadow-sm);
}

.stat-card__label {
    margin: 0 0 var(--s-3);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
    font-weight: 700;
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
    font-size: clamp(1.2rem, 2.2vw, 1.85rem);
    letter-spacing: 0;
}

.stat-card__badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface-2);
    color: var(--text-1);
    border-radius: var(--r-pill);
    border: 1px solid var(--border);
    padding: 6px 10px;
    font-size: 0.8rem;
}

.stat-card__meta {
    color: var(--text-2);
    font-size: 0.8rem;
    max-width: 92px;
    line-height: 1.3;
}

.clients-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
}

.clients-toolbar {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-4) var(--s-4) 0;
}

.clients-tabs {
    display: inline-flex;
    gap: var(--s-2);
    align-items: center;
}

.clients-tabs__button {
    border: 0;
    background: transparent;
    color: var(--text-1);
    border-radius: var(--r-sm);
    padding: 10px 14px;
    font-size: 0.875rem;
    cursor: pointer;
}

.clients-tabs__button--active {
    background: var(--primary);
    color: #fff;
    font-weight: 700;
}

.clients-toolbar__actions {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.clients-search {
    min-width: 310px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--r-sm);
    color: var(--text-3);
}

.clients-search input {
    flex: 1;
    border: 0;
    box-shadow: none;
    padding: 10px 0;
    background: transparent;
}

.clients-toolbar__button {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-1);
    border-radius: var(--r-sm);
    padding: 10px 14px;
    font: inherit;
    cursor: pointer;
}

.clients-toolbar__button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.clients-filters {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
}

.clients-table__head {
    background: var(--surface-2);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    margin-top: var(--s-3);
}

.clients-table__row {
    display: grid;
    grid-template-columns: minmax(260px, 2fr) minmax(160px, 1.2fr) 1fr 1.2fr 0.9fr 0.7fr;
    gap: var(--s-3);
    align-items: center;
    padding: var(--s-3) var(--s-4);
}

.clients-table__row--head {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.75rem;
    color: var(--text-2);
}

.clients-table__body .clients-table__row {
    border-bottom: 1px solid var(--border);
}

.clients-table__client {
    display: flex;
    align-items: center;
    gap: 14px;
}

.clients-table__avatar {
    width: 42px;
    height: 42px;
    border-radius: var(--r-sm);
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--text-1);
    font-weight: 700;
    font-size: 1rem;
}

.clients-table__name,
.clients-table__industry,
.clients-footer p {
    margin: 0;
}

.clients-table__name {
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 4px;
}

.clients-table__domain {
    margin: 0;
    color: var(--text-2);
    font-size: 0.8rem;
}

.clients-table__industry {
    color: var(--text-1);
    line-height: 1.45;
    font-size: 0.8rem;
}

.clients-table__status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-pill);
    padding: 6px 14px;
    background: var(--success-soft);
    color: var(--success);
    border: 1px solid #ccefd8;
    font-weight: 600;
    font-size: 0.75rem;
}

.clients-table__status--inactive {
    background: var(--warning-soft);
    color: var(--warning);
    border-color: #f5d8af;
}

.clients-table__actions {
    display: flex;
    gap: 8px;
}

.clients-table__menu {
    position: relative;
}

.clients-table__menu-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 140px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    padding: 6px;
    display: grid;
    gap: 4px;
    z-index: 5;
}

.clients-table__menu-panel button {
    border: 0;
    background: transparent;
    text-align: left;
    border-radius: var(--r-sm);
    padding: 8px 10px;
    font: inherit;
    cursor: pointer;
}

.clients-table__menu-panel button:hover {
    background: var(--surface-2);
}

.clients-table__icon-button {
    width: 36px;
    height: 36px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    display: grid;
    place-items: center;
    color: var(--text-1);
    cursor: pointer;
}

.clients-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
}

.clients-pagination {
    display: inline-flex;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.clients-pagination__button {
    min-width: 40px;
    height: 36px;
    padding: 0 16px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-1);
    font: inherit;
    cursor: pointer;
}

.clients-pagination__button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.clients-pagination__button--active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
}

.clients-empty,
.clients-loading {
    padding: var(--s-5) var(--s-4);
}

.clients-add-form {
    margin-bottom: -8px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--r-lg);
    padding: var(--s-4);
}

.clients-add-form__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(200px, 1fr));
    gap: var(--s-3);
    align-items: end;
}

.clients-add-form__actions {
    margin-top: var(--s-3);
    display: flex;
    justify-content: flex-end;
}

.form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.form-field__label {
    font-size: 0.8rem;
    color: var(--text-2);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.alert {
    border: 1px solid var(--danger);
    background: var(--danger-soft);
    color: #7f1d1d;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
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

    .clients-add-form__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 720px) {
    .clients-page {
        gap: var(--s-4);
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

    .clients-filters {
        flex-direction: column;
        align-items: stretch;
    }
}
</style>
