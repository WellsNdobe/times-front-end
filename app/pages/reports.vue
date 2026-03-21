<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { timesheetEntriesApi, type TimesheetEntry } from "~/api/timesheetEntriesApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

type ReportRow = TimesheetEntry & {
    timesheetStatus?: number
    timesheetWeekStart?: string
}

const org = ref<Organization | null>(null)
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const clients = ref<Client[]>([])
const timesheets = ref<Timesheet[]>([])
const rows = ref<ReportRow[]>([])

const loading = ref(true)
const error = ref<UiError | null>(null)

const nowWeekStart = formatDateForInput(getWeekStart(new Date()))
const fromWeekStart = ref(formatDateForInput(addDays(new Date(nowWeekStart), -7 * 7)))
const toWeekStart = ref(nowWeekStart)
const selectedClientId = ref("")
const selectedProjectId = ref("")
const selectedStatus = ref("")
const route = useRoute()

const projectById = computed(() => {
    const map = new Map<string, Project>()
    for (const project of projects.value) map.set(project.id, project)
    return map
})
const clientById = computed(() => {
    const map = new Map<string, Client>()
    for (const client of clients.value) map.set(client.id, client)
    return map
})
const memberNameByUserId = computed(() => {
    const map = new Map<string, string>()
    for (const member of members.value) {
        const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
        map.set(member.userId, fullName || "Unknown employee")
    }
    return map
})
const timesheetUserIdById = computed(() => {
    const map = new Map<string, string>()
    for (const sheet of timesheets.value) {
        if (!sheet.id || !sheet.userId) continue
        map.set(sheet.id, sheet.userId)
    }
    return map
})

const filteredRows = computed(() => {
    return rows.value.filter((row) => {
        if (selectedStatus.value && String(row.timesheetStatus ?? "") !== selectedStatus.value) {
            return false
        }
        if (selectedProjectId.value && row.projectId !== selectedProjectId.value) return false
        if (selectedClientId.value) {
            const project = projectById.value.get(row.projectId)
            const clientId = project?.clientId ?? ""
            if (clientId !== selectedClientId.value) return false
        }
        return true
    })
})

const filteredTimesheets = computed(() => {
    if (!selectedClientId.value && !selectedProjectId.value) {
        return timesheets.value.filter((sheet) => {
            if (!selectedStatus.value) return true
            return String(sheet.status ?? "") === selectedStatus.value
        })
    }
    const sheetIds = new Set(filteredRows.value.map((row) => row.timesheetId ?? ""))
    return timesheets.value.filter((sheet) => {
        if (!sheetIds.has(sheet.id)) return false
        if (!selectedStatus.value) return true
        return String(sheet.status ?? "") === selectedStatus.value
    })
})

const totalMinutes = computed(() =>
    filteredRows.value.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0)
)
const totalHours = computed(() => (totalMinutes.value / 60).toFixed(1))
const totalEntries = computed(() => filteredRows.value.length)
const touchedProjects = computed(() => new Set(filteredRows.value.map((r) => r.projectId)).size)
const representedClients = computed(() => {
    const clientIds = new Set<string>()
    for (const row of filteredRows.value) {
        const clientId = projectById.value.get(row.projectId)?.clientId
        if (clientId) clientIds.add(clientId)
    }
    return clientIds.size
})
const avgEntryHours = computed(() => {
    if (!totalEntries.value) return "0.0"
    return (totalMinutes.value / 60 / totalEntries.value).toFixed(1)
})
const activeFilterCount = computed(() =>
    [selectedClientId.value, selectedProjectId.value, selectedStatus.value].filter(Boolean).length
)
const hasActiveFilters = computed(
    () => Boolean(activeFilterCount.value || selectedClientId.value || selectedProjectId.value || selectedStatus.value)
)

const statusCounts = computed(() => {
    const counts = { draft: 0, submitted: 0, approved: 0, rejected: 0 }
    for (const sheet of filteredTimesheets.value) {
        if (sheet.status === 1) counts.submitted++
        else if (sheet.status === 2) counts.approved++
        else if (sheet.status === 3) counts.rejected++
        else counts.draft++
    }
    return counts
})

const totalStatuses = computed(() =>
    statusCounts.value.draft +
    statusCounts.value.submitted +
    statusCounts.value.approved +
    statusCounts.value.rejected
)

const statusSummary = computed(() => {
    const total = totalStatuses.value
    const items = [
        {
            key: "approved",
            label: "Approved",
            count: statusCounts.value.approved,
            icon: "mdi:check-circle",
            tone: "success",
        },
        {
            key: "submitted",
            label: "Submitted",
            count: statusCounts.value.submitted,
            icon: "mdi:progress-clock",
            tone: "warning",
        },
        {
            key: "draft",
            label: "Draft",
            count: statusCounts.value.draft,
            icon: "mdi:file-document-edit-outline",
            tone: "neutral",
        },
        {
            key: "rejected",
            label: "Rejected",
            count: statusCounts.value.rejected,
            icon: "mdi:close-circle",
            tone: "danger",
        },
    ]

    return items.map((item) => ({
        ...item,
        percent: total ? Math.round((item.count / total) * 100) : 0,
    }))
})

const hoursByProject = computed(() => {
    const totals = new Map<string, number>()
    for (const row of filteredRows.value) {
        totals.set(row.projectId, (totals.get(row.projectId) ?? 0) + (row.durationMinutes ?? 0))
    }
    const max = Math.max(...totals.values(), 0)
    return [...totals.entries()]
        .map(([projectId, minutes]) => ({
            projectId,
            label: projectById.value.get(projectId)?.name ?? "Unknown project",
            minutes,
            percent: max ? Math.round((minutes / max) * 100) : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes)
})

const hoursByClient = computed(() => {
    const totals = new Map<string, number>()
    for (const row of filteredRows.value) {
        const project = projectById.value.get(row.projectId)
        const clientId = project?.clientId ?? "unassigned"
        totals.set(clientId, (totals.get(clientId) ?? 0) + (row.durationMinutes ?? 0))
    }
    const max = Math.max(...totals.values(), 0)
    return [...totals.entries()]
        .map(([clientId, minutes]) => ({
            clientId,
            label:
                clientId === "unassigned"
                    ? "Unassigned"
                    : clientById.value.get(clientId)?.name ?? "Unknown client",
            minutes,
            percent: max ? Math.round((minutes / max) * 100) : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes)
})

const hoursByEmployee = computed(() => {
    const totals = new Map<string, number>()
    for (const row of filteredRows.value) {
        const timesheetId = row.timesheetId ?? ""
        const userId = timesheetUserIdById.value.get(timesheetId) ?? "unknown"
        totals.set(userId, (totals.get(userId) ?? 0) + (row.durationMinutes ?? 0))
    }
    const max = Math.max(...totals.values(), 0)
    return [...totals.entries()]
        .map(([userId, minutes]) => ({
            userId,
            label:
                userId === "unknown"
                    ? "Unknown employee"
                    : memberNameByUserId.value.get(userId) ?? "Unknown employee",
            minutes,
            percent: max ? Math.round((minutes / max) * 100) : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes)
})

const weeklyTrend = computed(() => {
    const totals = new Map<string, number>()
    for (const row of filteredRows.value) {
        const weekStart = formatDateForInput(getWeekStart(new Date(row.workDate)))
        totals.set(weekStart, (totals.get(weekStart) ?? 0) + (row.durationMinutes ?? 0))
    }
    const points = [...totals.entries()]
        .map(([weekStart, minutes]) => ({ weekStart, minutes }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    const max = Math.max(...points.map((p) => p.minutes), 0)
    return points.map((point) => ({
        ...point,
        percent: max ? Math.max(8, Math.round((point.minutes / max) * 100)) : 8,
        shortLabel: formatWeekLabel(point.weekStart),
    }))
})

const selectedRangeLabel = computed(
    () => `${formatLongDate(fromWeekStart.value)} – ${formatLongDate(toWeekStart.value)}`
)

onMounted(() => loadReports())

async function loadReports() {
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

        const [membersResult, projectsResult, clientsResult, sheets] = await Promise.all([
            organizationsApi.getMembers(org.value.id),
            projectsApi.list(org.value.id),
            clientsApi.list(org.value.id),
            timesheetsApi.listOrg(org.value.id, {
                fromWeekStart: fromWeekStart.value,
                toWeekStart: toWeekStart.value,
            }),
        ])
        members.value = membersResult
        projects.value = projectsResult
        clients.value = clientsResult
        timesheets.value = sheets
        const clientIdFromQuery = typeof route.query.clientId === "string" ? route.query.clientId : ""
        if (clientIdFromQuery && clientsResult.some((client) => client.id === clientIdFromQuery)) {
            selectedClientId.value = clientIdFromQuery
        }

        const entryGroups = await Promise.all(
            sheets.map(async (sheet) => {
                try {
                    const entries = await timesheetEntriesApi.list(org.value!.id, sheet.id)
                    return entries.map((entry) => ({
                        ...entry,
                        timesheetStatus: sheet.status,
                        timesheetWeekStart: sheet.weekStartDate,
                    }))
                } catch {
                    return [] as ReportRow[]
                }
            })
        )
        rows.value = entryGroups.flat()
    } catch (e) {
        console.error("Load reports error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

function resetFilters() {
    selectedClientId.value = ""
    selectedProjectId.value = ""
    selectedStatus.value = ""
}

function formatDateForInput(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function getWeekStart(date: Date) {
    const start = new Date(date)
    const day = start.getDay()
    const diff = (day + 6) % 7
    start.setDate(start.getDate() - diff)
    start.setHours(0, 0, 0, 0)
    return start
}

function addDays(date: Date, days: number) {
    const copy = new Date(date)
    copy.setDate(copy.getDate() + days)
    return copy
}

function formatMinutes(total: number) {
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    if (!hours) return `${minutes}m`
    return `${hours}h ${minutes}m`
}

function formatStatus(status?: number) {
    if (status === 1) return "Submitted"
    if (status === 2) return "Approved"
    if (status === 3) return "Rejected"
    return "Draft"
}

function formatLongDate(value: string) {
    if (!value) return "—"
    const date = new Date(`${value}T00:00:00`)
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date)
}

function formatWeekLabel(value: string) {
    if (!value) return "—"
    const date = new Date(`${value}T00:00:00`)
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    }).format(date)
}

function toCsvValue(value: string | number) {
    const text = String(value)
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replaceAll("\"", "\"\"")}"`
    }
    return text
}

function downloadCsv(filename: string, headers: string[], lines: Array<Array<string | number>>) {
    const csv = [headers, ...lines]
        .map((line) => line.map((v) => toCsvValue(v)).join(","))
        .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

function exportHoursByClient() {
    downloadCsv(
        "hours_by_client.csv",
        ["client", "minutes", "hours"],
        hoursByClient.value.map((item) => [item.label, item.minutes, (item.minutes / 60).toFixed(2)])
    )
}

function exportHoursByProject() {
    downloadCsv(
        "hours_by_project.csv",
        ["project", "minutes", "hours"],
        hoursByProject.value.map((item) => [item.label, item.minutes, (item.minutes / 60).toFixed(2)])
    )
}

function exportStatusSummary() {
    downloadCsv("timesheet_status_summary.csv", ["status", "count"], [
        ["Draft", statusCounts.value.draft],
        ["Submitted", statusCounts.value.submitted],
        ["Approved", statusCounts.value.approved],
        ["Rejected", statusCounts.value.rejected],
    ])
}

function exportDetailedRows() {
    downloadCsv(
        "detailed_time_entries.csv",
        ["week_start", "work_date", "project", "client", "status", "minutes", "hours", "notes"],
        filteredRows.value.map((row) => {
            const project = projectById.value.get(row.projectId)
            const clientName =
                project?.clientId && clientById.value.get(project.clientId)
                    ? clientById.value.get(project.clientId)!.name
                    : "Unassigned"
            return [
                row.timesheetWeekStart ?? "",
                row.workDate,
                project?.name ?? "Unknown project",
                clientName,
                formatStatus(row.timesheetStatus),
                row.durationMinutes ?? 0,
                ((row.durationMinutes ?? 0) / 60).toFixed(2),
                row.notes ?? "",
            ]
        })
    )
}
</script>

<template>
    <section class="reports">
        <header class="card reports__hero">
            <div class="reports__hero-copy">
                <p class="reports__eyebrow">Reporting workspace</p>
                <h1 class="reports__title">Reports</h1>
                <p class="reports__subtitle">
                    Organization-wide analytics and exports based on current timesheet data.
                </p>
                <div class="reports__hero-meta">
                    <span class="reports__range-pill">
                        <Icon name="mdi:calendar-range" size="16" />
                        {{ selectedRangeLabel }}
                    </span>
                    <span class="reports__hero-meta-text">{{ filteredRows.length }} filtered entries</span>
                </div>
            </div>

            <div class="reports__hero-actions">
                <button type="button" class="btn btn-primary reports__export-main" @click="exportDetailedRows">
                    <Icon name="mdi:download" size="18" />
                    Export detailed CSV
                </button>
                <div class="reports__quick-actions">
                    <button type="button" class="btn btn-secondary btn-quiet" @click="exportHoursByClient">
                        Clients CSV
                    </button>
                    <button type="button" class="btn btn-secondary btn-quiet" @click="exportHoursByProject">
                        Projects CSV
                    </button>
                    <button type="button" class="btn btn-secondary btn-quiet" @click="exportStatusSummary">
                        Status CSV
                    </button>
                </div>
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <section class="card reports__filters">
            <div class="reports__filters-head">
                <div>
                    <p class="reports__section-label">Filters</p>
                    <h2 class="reports__section-title">Refine the reporting window</h2>
                </div>
                <button
                    type="button"
                    class="reports__reset"
                    :disabled="!hasActiveFilters"
                    @click="resetFilters"
                >
                    <Icon name="mdi:refresh" size="18" />
                    Reset filters
                </button>
            </div>

            <div class="reports__filter-grid">
                <label class="reports__field">
                    <span>From week</span>
                    <input v-model="fromWeekStart" type="date" />
                </label>
                <label class="reports__field">
                    <span>To week</span>
                    <input v-model="toWeekStart" type="date" />
                </label>
                <label class="reports__field">
                    <span>Client</span>
                    <select v-model="selectedClientId">
                        <option value="">All clients</option>
                        <option v-for="client in clients" :key="client.id" :value="client.id">
                            {{ client.name }}
                        </option>
                    </select>
                </label>
                <label class="reports__field">
                    <span>Project</span>
                    <select v-model="selectedProjectId">
                        <option value="">All projects</option>
                        <option v-for="project in projects" :key="project.id" :value="project.id">
                            {{ project.name }}
                        </option>
                    </select>
                </label>
                <label class="reports__field">
                    <span>Status</span>
                    <select v-model="selectedStatus">
                        <option value="">All statuses</option>
                        <option value="0">Draft</option>
                        <option value="1">Submitted</option>
                        <option value="2">Approved</option>
                        <option value="3">Rejected</option>
                    </select>
                </label>
                <div class="reports__filter-actions">
                    <button type="button" class="btn btn-primary reports__apply" :disabled="loading" @click="loadReports">
                        <Icon v-if="!loading" name="mdi:check" size="18" />
                        <Icon v-else name="mdi:loading" size="18" class="spin" />
                        {{ loading ? "Loading..." : "Apply" }}
                    </button>
                    <p class="reports__filter-hint">
                        {{ activeFilterCount ? `${activeFilterCount} quick filters active` : "Showing all current filters" }}
                    </p>
                </div>
            </div>
        </section>

        <template v-if="loading">
            <section class="card reports__loading">
                <p class="muted">Loading report dataset...</p>
            </section>
        </template>

        <template v-else>
            <section class="reports__kpis">
                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Total hours</p>
                        <p class="kpi-card__value">{{ totalHours }}h</p>
                        <p class="kpi-card__meta">Across {{ filteredRows.length }} entries in the selected range</p>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--primary">
                        <Icon name="mdi:clock-outline" size="24" />
                    </span>
                </article>

                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Entries count</p>
                        <p class="kpi-card__value">{{ totalEntries }}</p>
                        <p class="kpi-card__meta">Average {{ avgEntryHours }}h per logged entry</p>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--info">
                        <Icon name="mdi:file-document-outline" size="24" />
                    </span>
                </article>

                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Projects touched</p>
                        <p class="kpi-card__value">{{ touchedProjects }}</p>
                        <p class="kpi-card__meta">Spanning {{ representedClients }} client accounts</p>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--accent">
                        <Icon name="mdi:briefcase-outline" size="24" />
                    </span>
                </article>

                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Timesheets in range</p>
                        <p class="kpi-card__value">{{ filteredTimesheets.length }}</p>
                        <p class="kpi-card__meta">{{ statusCounts.submitted }} currently submitted for review</p>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--neutral">
                        <Icon name="mdi:calendar-text-outline" size="24" />
                    </span>
                </article>
            </section>

            <section class="reports__content-grid">
                <article class="card report-panel report-panel--trend">
                    <header class="report-panel__head report-panel__head--spread">
                        <div>
                            <p class="reports__section-label">Trend</p>
                            <h2 class="reports__section-title">Weekly trend</h2>
                            <p class="report-panel__subtitle">Weekly totals built from the selected report rows.</p>
                        </div>
                        <div class="report-panel__legend">
                            <span class="report-panel__legend-dot"></span>
                            Logged time
                        </div>
                    </header>

                    <div v-if="weeklyTrend.length" class="trend-chart">
                        <div v-for="point in weeklyTrend" :key="point.weekStart" class="trend-chart__item">
                            <p class="trend-chart__value">{{ formatMinutes(point.minutes) }}</p>
                            <div class="trend-chart__bar-wrap">
                                <div class="trend-chart__bar" :style="{ height: `${point.percent}%` }"></div>
                            </div>
                            <p class="trend-chart__label">{{ point.shortLabel }}</p>
                        </div>
                    </div>
                    <p v-else class="muted">No data in the selected range.</p>
                </article>

                <article class="card report-panel report-panel--status">
                    <header class="report-panel__head">
                        <p class="reports__section-label">Statuses</p>
                        <h2 class="reports__section-title">Status summary</h2>
                        <p class="report-panel__subtitle">Share of timesheets currently visible in this report.</p>
                    </header>

                    <div class="status-list">
                        <div v-for="item in statusSummary" :key="item.key" class="status-list__item" :class="`status-list__item--${item.tone}`">
                            <div class="status-list__label-wrap">
                                <span class="status-list__icon">
                                    <Icon :name="item.icon" size="18" />
                                </span>
                                <span class="status-list__label">{{ item.label }}</span>
                            </div>
                            <div class="status-list__metrics">
                                <strong>{{ item.count }}</strong>
                                <span>{{ item.percent }}%</span>
                            </div>
                        </div>
                    </div>

                    <button type="button" class="btn btn-secondary report-panel__footer-btn" @click="exportStatusSummary">
                        Export status CSV
                    </button>
                </article>

                <article class="card report-panel">
                    <header class="report-panel__head">
                        <p class="reports__section-label">People</p>
                        <h2 class="reports__section-title">Hours by employee</h2>
                        <p class="report-panel__subtitle">Top contributors based on the current filters.</p>
                    </header>

                    <ul v-if="hoursByEmployee.length" class="rank-list">
                        <li v-for="item in hoursByEmployee" :key="item.userId" class="rank-list__item">
                            <div class="rank-list__row">
                                <span class="rank-list__name">{{ item.label }}</span>
                                <strong class="rank-list__value">{{ formatMinutes(item.minutes) }}</strong>
                            </div>
                            <div class="rank-list__track">
                                <div class="rank-list__fill rank-list__fill--employee" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="muted">No employee activity found.</p>
                </article>

                <article class="card report-panel">
                    <header class="report-panel__head">
                        <p class="reports__section-label">Clients</p>
                        <h2 class="reports__section-title">Hours by client</h2>
                        <p class="report-panel__subtitle">Client totals grouped from matching project activity.</p>
                    </header>

                    <ul v-if="hoursByClient.length" class="rank-list">
                        <li v-for="item in hoursByClient" :key="item.clientId" class="rank-list__item">
                            <div class="rank-list__row">
                                <span class="rank-list__name">{{ item.label }}</span>
                                <strong class="rank-list__value">{{ formatMinutes(item.minutes) }}</strong>
                            </div>
                            <div class="rank-list__track">
                                <div class="rank-list__fill rank-list__fill--client" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="muted">No client activity found.</p>

                    <button type="button" class="btn btn-secondary report-panel__footer-btn" @click="exportHoursByClient">
                        Export client CSV
                    </button>
                </article>

                <article class="card report-panel">
                    <header class="report-panel__head">
                        <p class="reports__section-label">Projects</p>
                        <h2 class="reports__section-title">Hours by project</h2>
                        <p class="report-panel__subtitle">Project totals calculated from the selected entry set.</p>
                    </header>

                    <ul v-if="hoursByProject.length" class="rank-list">
                        <li v-for="item in hoursByProject" :key="item.projectId" class="rank-list__item">
                            <div class="rank-list__row">
                                <span class="rank-list__name">{{ item.label }}</span>
                                <strong class="rank-list__value">{{ formatMinutes(item.minutes) }}</strong>
                            </div>
                            <div class="rank-list__track">
                                <div class="rank-list__fill" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="muted">No project activity found.</p>

                    <button type="button" class="btn btn-secondary report-panel__footer-btn" @click="exportHoursByProject">
                        Export project CSV
                    </button>
                </article>
            </section>
        </template>
    </section>
</template>

<style scoped>
.reports {
    display: grid;
    gap: var(--s-4);
}

.reports__hero {
    padding: var(--s-5);
    display: flex;
    justify-content: space-between;
    gap: var(--s-4);
    align-items: flex-start;
}

.reports__hero-copy {
    display: grid;
    gap: var(--s-2);
}

.reports__eyebrow,
.reports__section-label {
    margin: 0;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
    font-weight: 700;
}

.reports__title {
    margin: 0;
    font-size: clamp(1.4rem, 3vw, 2rem);
    line-height: 1.1;
}

.reports__subtitle {
    margin: 0;
    max-width: 60ch;
    color: var(--text-2);
}

.reports__hero-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    align-items: center;
}

.reports__range-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: var(--r-pill);
    background: var(--primary-soft);
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 700;
}

.reports__hero-meta-text {
    color: var(--text-2);
    font-size: 0.95rem;
}

.reports__hero-actions {
    display: grid;
    gap: var(--s-2);
    justify-items: end;
    min-width: min(100%, 290px);
}

.reports__export-main,
.reports__apply,
.reports__reset,
.report-panel__footer-btn,
.btn-quiet {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.reports__export-main {
    width: 100%;
}

.reports__quick-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--s-2);
}

.btn-quiet {
    padding-inline: 12px;
}

.reports__filters {
    padding: var(--s-4);
    display: grid;
    gap: var(--s-4);
}

.reports__filters-head {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    align-items: start;
}

.reports__section-title {
    margin: 4px 0 0 0;
    font-size: 1rem;
}

.reports__reset {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-2);
    border-radius: var(--r-sm);
    padding: 10px 14px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}

.reports__reset:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.reports__filter-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--s-3);
    align-items: end;
}

.reports__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.reports__field span {
    font-size: 0.8rem;
    color: var(--text-2);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.reports__field :is(input, select) {
    min-height: 44px;
}

.reports__filter-actions {
    display: grid;
    gap: var(--s-2);
    align-self: stretch;
}

.reports__apply {
    min-height: 44px;
}

.reports__filter-hint {
    margin: 0;
    color: var(--text-2);
    font-size: 0.875rem;
}

.reports__loading {
    padding: var(--s-4);
}

.reports__kpis {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--s-3);
}

.kpi-card {
    grid-column: span 3;
    padding: var(--s-4);
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    align-items: flex-start;
}

.kpi-card__label {
    margin: 0;
    color: var(--text-2);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
}

.kpi-card__value {
    margin: var(--s-2) 0 var(--s-1) 0;
    font-size: clamp(1.2rem, 2.2vw, 1.85rem);
    font-weight: 800;
}

.kpi-card__meta {
    margin: 0;
    color: var(--text-2);
    font-size: 0.9rem;
    line-height: 1.45;
}

.kpi-card__icon {
    width: 58px;
    height: 58px;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.kpi-card__icon--primary {
    background: var(--primary-soft);
    color: var(--primary);
}

.kpi-card__icon--info {
    background: var(--info-soft);
    color: var(--info);
}

.kpi-card__icon--accent {
    background: var(--accent-soft);
    color: #b6671e;
}

.kpi-card__icon--neutral {
    background: var(--surface-2);
    color: var(--text-2);
}

.reports__content-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--s-3);
}

.report-panel {
    grid-column: span 4;
    padding: var(--s-4);
    display: grid;
    gap: var(--s-3);
}

.report-panel--trend {
    grid-column: span 8;
}

.report-panel--status {
    grid-column: span 4;
}

.report-panel__head {
    display: grid;
    gap: 4px;
}

.report-panel__head--spread {
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: var(--s-3);
}

.report-panel__subtitle {
    margin: 0;
    color: var(--text-2);
    font-size: 0.875rem;
}

.report-panel__legend {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-2);
    font-size: 0.95rem;
}

.report-panel__legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: var(--primary);
}

.trend-chart {
    min-height: 320px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
    align-items: end;
    gap: var(--s-2);
}

.trend-chart__item {
    display: grid;
    gap: 8px;
    justify-items: center;
}

.trend-chart__bar-wrap {
    width: 100%;
    height: 220px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    align-items: end;
    padding: 6px;
    overflow: hidden;
}

.trend-chart__bar {
    width: 100%;
    border-radius: 8px;
    background: var(--primary);
    min-height: 12px;
    transition: height 320ms ease;
}

.trend-chart__value,
.trend-chart__label {
    margin: 0;
    text-align: center;
}

.trend-chart__value {
    color: var(--text-2);
    font-size: 0.78rem;
}

.trend-chart__label {
    font-size: 0.78rem;
    font-weight: 700;
}

.status-list {
    display: grid;
    gap: var(--s-2);
}

.status-list__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3);
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
}

.status-list__item--success {
    background: var(--success-soft);
    color: #14532d;
}

.status-list__item--warning {
    background: var(--warning-soft);
    color: #7c2d12;
}

.status-list__item--neutral {
    background: var(--surface-2);
    color: var(--text-1);
}

.status-list__item--danger {
    background: var(--danger-soft);
    color: #7f1d1d;
}

.status-list__label-wrap,
.status-list__metrics {
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.status-list__icon {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.78);
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.status-list__label {
    font-weight: 700;
}

.status-list__metrics {
    flex-direction: column;
    align-items: flex-end;
    gap: 0;
}

.status-list__metrics strong {
    font-size: 0.95rem;
}

.status-list__metrics span {
    font-size: 0.85rem;
    opacity: 0.8;
}

.rank-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--s-3);
}

.rank-list__item {
    display: grid;
    gap: 8px;
}

.rank-list__row {
    display: flex;
    justify-content: space-between;
    gap: var(--s-2);
    align-items: center;
}

.rank-list__name {
    font-weight: 600;
}

.rank-list__value {
    font-size: 0.95rem;
}

.rank-list__track {
    width: 100%;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    overflow: hidden;
}

.rank-list__fill {
    height: 100%;
    border-radius: var(--r-pill);
    background: var(--primary);
}

.rank-list__fill--client {
    background: var(--accent);
}

.rank-list__fill--employee {
    background: var(--info);
}

.report-panel__footer-btn {
    margin-top: auto;
    width: 100%;
}

.muted {
    margin: 0;
    color: var(--text-2);
}

.spin {
    animation: spin 0.9s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 1180px) {
    .reports__filter-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .kpi-card {
        grid-column: span 6;
    }

    .report-panel--trend,
    .report-panel--status,
    .report-panel {
        grid-column: span 12;
    }
}

@media (max-width: 760px) {
    .reports__hero,
    .reports__filters {
        padding: var(--s-4);
    }

    .reports__hero,
    .reports__filters-head {
        flex-direction: column;
        align-items: stretch;
    }

    .reports__hero-actions,
    .reports__quick-actions {
        justify-items: stretch;
        justify-content: flex-start;
    }

    .reports__filter-grid,
    .reports__kpis,
    .reports__content-grid {
        grid-template-columns: 1fr;
    }

    .kpi-card,
    .report-panel,
    .report-panel--trend,
    .report-panel--status {
        grid-column: auto;
    }

    .report-panel__head--spread {
        grid-template-columns: 1fr;
    }

    .trend-chart {
        grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
        min-height: 260px;
    }

    .trend-chart__bar-wrap {
        height: 170px;
    }

    .status-list__item {
        align-items: flex-start;
    }
}
</style>
