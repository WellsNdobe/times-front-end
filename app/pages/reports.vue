<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref } from "vue"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import { reportingApi, type ReportsDataset } from "~/api/reportingApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const org = ref<Organization | null>(null)
const projects = ref<Project[]>([])
const clients = ref<Client[]>([])
const report = ref<ReportsDataset | null>(null)

const loading = ref(true)
const error = ref<UiError | null>(null)

const nowWeekStart = formatDateForInput(getWeekStart(new Date()))
const fromWeekStart = ref(formatDateForInput(addDays(new Date(nowWeekStart), -7 * 7)))
const toWeekStart = ref(nowWeekStart)
const selectedClientId = ref("")
const selectedProjectId = ref("")
const selectedStatus = ref("")

const totalMinutes = computed(() => report.value?.totalMinutes ?? 0)
const totalHours = computed(() => (report.value?.totalHours ?? 0).toFixed(1))
const totalEntries = computed(() => report.value?.totalEntries ?? 0)
const touchedProjects = computed(() => report.value?.touchedProjects ?? 0)
const timesheetsInRange = computed(() => report.value?.timesheetsInRange ?? 0)

const statusCounts = computed(() => {
    const summary = report.value?.statusSummary
    return {
        draft: summary?.draft ?? 0,
        submitted: summary?.submitted ?? 0,
        approved: summary?.approved ?? 0,
        rejected: summary?.rejected ?? 0,
    }
})

const hoursByProject = computed(() => {
    const source = report.value?.hoursByProject ?? []
    const max = Math.max(...source.map((item) => item.totalMinutes), 0)
    return source.map((item) => ({
        projectId: item.projectId,
        label: item.projectName || "Unknown project",
        minutes: item.totalMinutes ?? 0,
        percent: max ? Math.round(((item.totalMinutes ?? 0) / max) * 100) : 0,
    }))
})

const hoursByClient = computed(() => {
    const source = report.value?.hoursByClient ?? []
    const max = Math.max(...source.map((item) => item.totalMinutes), 0)
    return source.map((item) => ({
        clientId: item.clientId ?? "unassigned",
        label: item.clientName || "Unassigned",
        minutes: item.totalMinutes ?? 0,
        percent: max ? Math.round(((item.totalMinutes ?? 0) / max) * 100) : 0,
    }))
})

const hoursByEmployee = computed(() => {
    const source = report.value?.hoursByEmployee ?? []
    const max = Math.max(...source.map((item) => item.totalMinutes), 0)
    return source.map((item) => ({
        userId: item.userId,
        label: item.employeeName || "Unknown employee",
        minutes: item.totalMinutes ?? 0,
        percent: max ? Math.round(((item.totalMinutes ?? 0) / max) * 100) : 0,
    }))
})

const weeklyTrend = computed(() => {
    const source = report.value?.weeklyTrend ?? []
    const max = Math.max(...source.map((item) => item.totalMinutes), 0)
    return source.map((item) => ({
        weekStart: item.weekStartDate,
        minutes: item.totalMinutes ?? 0,
        percent: max ? Math.max(8, Math.round(((item.totalMinutes ?? 0) / max) * 100)) : 8,
    }))
})

const detailedRows = computed(() => report.value?.detailedRows ?? [])

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

        const [projectsResult, clientsResult, reportResult] = await Promise.all([
            projectsApi.list(org.value.id),
            clientsApi.list(org.value.id),
            reportingApi.getReports(org.value.id, buildReportParams()),
        ])

        projects.value = projectsResult
        clients.value = clientsResult
        report.value = reportResult
    } catch (e) {
        console.error("Load reports error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

function buildReportParams() {
    const params: {
        fromWeekStart: string
        toWeekStart: string
        clientId?: string
        projectId?: string
        status?: number
    } = {
        fromWeekStart: fromWeekStart.value,
        toWeekStart: toWeekStart.value,
    }

    if (selectedClientId.value) params.clientId = selectedClientId.value
    if (selectedProjectId.value) params.projectId = selectedProjectId.value
    if (selectedStatus.value !== "") params.status = Number(selectedStatus.value)

    return params
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
        ["week_start", "work_date", "employee", "project", "client", "status", "minutes", "hours", "notes"],
        detailedRows.value.map((row) => [
            row.timesheetWeekStartDate,
            row.workDate,
            row.employeeName,
            row.projectName,
            row.clientName,
            formatStatus(row.timesheetStatus),
            row.durationMinutes,
            (row.durationMinutes / 60).toFixed(2),
            row.notes ?? "",
        ])
    )
}
</script>

<template>
    <section class="reports">
        <header class="card reports__hero">
            <div>
                <h1 class="reports__title">Reports</h1>
                <p class="reports__subtitle">
                    Client, project and submission reporting from current timesheet data.
                </p>
            </div>
            <div class="reports__export-actions">
                <button type="button" class="btn btn-secondary" @click="exportHoursByClient">
                    Export clients CSV
                </button>
                <button type="button" class="btn btn-secondary" @click="exportHoursByProject">
                    Export projects CSV
                </button>
                <button type="button" class="btn btn-secondary" @click="exportStatusSummary">
                    Export status CSV
                </button>
                <button type="button" class="btn btn-primary" @click="exportDetailedRows">
                    Export detailed CSV
                </button>
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <section class="card reports__filters">
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
                    <button type="button" class="btn btn-primary" :disabled="loading" @click="loadReports">
                        {{ loading ? "Loading..." : "Apply" }}
                    </button>
                    <button type="button" class="btn btn-secondary" @click="resetFilters">
                        Reset
                    </button>
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
                <article class="card kpi">
                    <p class="kpi__label">Total hours</p>
                    <p class="kpi__value">{{ totalHours }}h</p>
                </article>
                <article class="card kpi">
                    <p class="kpi__label">Entries</p>
                    <p class="kpi__value">{{ totalEntries }}</p>
                </article>
                <article class="card kpi">
                    <p class="kpi__label">Projects touched</p>
                    <p class="kpi__value">{{ touchedProjects }}</p>
                </article>
                <article class="card kpi">
                    <p class="kpi__label">Timesheets in range</p>
                    <p class="kpi__value">{{ timesheetsInRange }}</p>
                </article>
            </section>

            <section class="reports__grid">
                <article class="card panel">
                    <header class="panel__head">
                        <h2>Weekly trend</h2>
                    </header>
                    <div v-if="weeklyTrend.length" class="trend">
                        <div v-for="point in weeklyTrend" :key="point.weekStart" class="trend__item">
                            <div class="trend__bar-wrap">
                                <div class="trend__bar" :style="{ height: `${point.percent}%` }"></div>
                            </div>
                            <p class="trend__value">{{ formatMinutes(point.minutes) }}</p>
                            <p class="trend__label">{{ point.weekStart }}</p>
                        </div>
                    </div>
                    <p v-else class="muted">No data in selected range.</p>
                </article>

                <article class="card panel">
                    <header class="panel__head">
                        <h2>Hours by employee</h2>
                    </header>
                    <ul v-if="hoursByEmployee.length" class="list">
                        <li v-for="item in hoursByEmployee" :key="item.userId" class="list__item">
                            <div class="list__row">
                                <span>{{ item.label }}</span>
                                <strong>{{ formatMinutes(item.minutes) }}</strong>
                            </div>
                            <div class="list__track">
                                <div
                                    class="list__fill list__fill--employee"
                                    :style="{ width: `${item.percent}%` }"
                                ></div>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="muted">No employee activity found.</p>
                </article>

                <article class="card panel">
                    <header class="panel__head">
                        <h2>Hours by client</h2>
                    </header>
                    <ul v-if="hoursByClient.length" class="list">
                        <li v-for="item in hoursByClient" :key="item.clientId" class="list__item">
                            <div class="list__row">
                                <span>{{ item.label }}</span>
                                <strong>{{ formatMinutes(item.minutes) }}</strong>
                            </div>
                            <div class="list__track">
                                <div class="list__fill list__fill--client" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="muted">No client activity found.</p>
                </article>

                <article class="card panel">
                    <header class="panel__head">
                        <h2>Hours by project</h2>
                    </header>
                    <ul v-if="hoursByProject.length" class="list">
                        <li v-for="item in hoursByProject" :key="item.projectId" class="list__item">
                            <div class="list__row">
                                <span>{{ item.label }}</span>
                                <strong>{{ formatMinutes(item.minutes) }}</strong>
                            </div>
                            <div class="list__track">
                                <div class="list__fill" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="muted">No project activity found.</p>
                </article>
            </section>

            <section class="card reports__status">
                <header class="panel__head">
                    <h2>Timesheet status summary</h2>
                </header>
                <div class="status-grid">
                    <div class="status-cell">
                        <span>Draft</span>
                        <strong>{{ statusCounts.draft }}</strong>
                    </div>
                    <div class="status-cell">
                        <span>Submitted</span>
                        <strong>{{ statusCounts.submitted }}</strong>
                    </div>
                    <div class="status-cell">
                        <span>Approved</span>
                        <strong>{{ statusCounts.approved }}</strong>
                    </div>
                    <div class="status-cell">
                        <span>Rejected</span>
                        <strong>{{ statusCounts.rejected }}</strong>
                    </div>
                </div>
            </section>

            <section class="card reports__note">
                <p class="muted">
                    Team-wide reports are shown using org-level timesheets for the selected date range.
                </p>
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
    align-items: flex-end;
}

.reports__title {
    margin: 0;
    font-size: 1.5rem;
}

.reports__subtitle {
    margin: var(--s-1) 0 0 0;
    color: var(--text-2);
}

.reports__export-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}

.reports__filters {
    padding: var(--s-4);
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
    gap: var(--s-1);
}

.reports__field span {
    font-size: 0.8rem;
    color: var(--text-2);
    font-weight: 600;
}

.reports__filter-actions {
    display: flex;
    gap: var(--s-2);
}

.reports__kpis {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--s-3);
}

.kpi {
    grid-column: span 3;
    padding: var(--s-4);
}

.kpi__label {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
}

.kpi__value {
    margin: var(--s-2) 0 0 0;
    font-size: 1.6rem;
    font-weight: 800;
}

.reports__grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--s-3);
}

.panel {
    padding: var(--s-4);
}

.reports__grid > .panel:nth-child(1) {
    grid-column: span 6;
}

.reports__grid > .panel:nth-child(2),
.reports__grid > .panel:nth-child(3),
.reports__grid > .panel:nth-child(4) {
    grid-column: span 6;
}

.panel__head h2 {
    margin: 0;
    font-size: 1rem;
}

.trend {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: var(--s-2);
}

.trend__item {
    display: grid;
    justify-items: center;
    gap: 4px;
}

.trend__bar-wrap {
    width: 100%;
    height: 120px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    display: flex;
    align-items: end;
    padding: 4px;
}

.trend__bar {
    width: 100%;
    background: var(--primary);
    border-radius: 8px;
}

.trend__value,
.trend__label {
    margin: 0;
    font-size: 0.75rem;
}

.trend__value {
    color: var(--text-2);
}

.list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--s-2);
}

.list__item {
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    padding: var(--s-2);
}

.list__row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    gap: var(--s-2);
}

.list__track {
    width: 100%;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    overflow: hidden;
}

.list__fill {
    height: 100%;
    background: var(--primary);
}

.list__fill--client {
    background: var(--accent);
}

.list__fill--employee {
    background: var(--success, #22c55e);
}

.reports__status {
    padding: var(--s-4);
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--s-3);
}

.status-cell {
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    padding: var(--s-3);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.status-cell span {
    color: var(--text-2);
    font-size: 0.875rem;
}

.status-cell strong {
    font-size: 1.2rem;
}

.reports__note,
.reports__loading {
    padding: var(--s-4);
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@media (max-width: 1100px) {
    .reports__filter-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .kpi,
    .reports__grid > .panel:nth-child(1),
    .reports__grid > .panel:nth-child(2),
    .reports__grid > .panel:nth-child(3),
    .reports__grid > .panel:nth-child(4) {
        grid-column: span 12;
    }
}

@media (max-width: 760px) {
    .reports__hero {
        flex-direction: column;
        align-items: flex-start;
        padding: var(--s-4);
    }

    .reports__filter-grid {
        grid-template-columns: 1fr;
    }

    .status-grid {
        grid-template-columns: 1fr;
    }
}
</style>

