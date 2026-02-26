<script setup lang="ts">
definePageMeta({ middleware: ["auth", "manager-only"] })

import { computed, onMounted, ref, watch } from "vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { timesheetEntriesApi, type TimesheetEntry } from "~/api/timesheetEntriesApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const { user } = useAuth()

const org = ref<Organization | null>(null)
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const clients = ref<Client[]>([])
const orgTimesheets = ref<Timesheet[]>([])
const orgEntries = ref<TimesheetEntry[]>([])
const pendingApprovalCount = ref(0)

const loading = ref(true)
const error = ref<UiError | null>(null)

const weekStartDate = ref(formatDateForInput(getWeekStart(new Date())))
const today = formatDateForInput(new Date())
const selectedClientFilter = ref<string | null>(null)

const weekLabel = computed(() => {
    const start = new Date(weekStartDate.value)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return `${formatShortDate(start)} - ${formatShortDate(end)}`
})
const isCurrentWeek = computed(
    () => weekStartDate.value === formatDateForInput(getWeekStart(new Date()))
)

const myMember = computed(() => {
    if (!user.value?.userId) return null
    return members.value.find((member) => member.userId === user.value?.userId) ?? null
})
const userDisplayName = computed(() => {
    const fullName = [myMember.value?.firstName, myMember.value?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
    if (fullName) return fullName
    const email = user.value?.email ?? ""
    if (email.includes("@")) return email.split("@")[0]
    return "there"
})
const isManagerOrAdmin = computed(() => {
    const role = myMember.value?.role
    return role === 0 || role === 1
})

const statusSummary = computed(() => {
    let submitted = 0
    let approved = 0
    let rejected = 0
    let draft = 0
    for (const ts of orgTimesheets.value) {
        if (ts.status === 1) submitted++
        else if (ts.status === 2) approved++
        else if (ts.status === 3) rejected++
        else draft++
    }
    return {
        total: orgTimesheets.value.length,
        submitted,
        approved,
        rejected,
        draft,
    }
})
const statusSummaryLabel = computed(() => {
    if (!statusSummary.value.total) return "No data"
    const submittedOrApproved = statusSummary.value.submitted + statusSummary.value.approved
    return `${submittedOrApproved}/${statusSummary.value.total}`
})
const statusSummaryMeta = computed(() => {
    if (!statusSummary.value.total) return "No timesheets for this week."
    return `${statusSummary.value.approved} approved • ${statusSummary.value.draft} draft • ${statusSummary.value.rejected} rejected`
})
const statusSummaryPill = computed(() => {
    if (!statusSummary.value.total) return "No data"
    if (statusSummary.value.submitted === statusSummary.value.total) return "On track"
    if (statusSummary.value.rejected > 0) return "Needs attention"
    return "In progress"
})
const statusToneClass = computed(() => {
    if (!statusSummary.value.total) return "kpi__pill--neutral"
    if (statusSummary.value.submitted === statusSummary.value.total) return "kpi__pill--success"
    if (statusSummary.value.rejected > 0) return "kpi__pill--warning"
    return "kpi__pill--info"
})

const weekMinutes = computed(() =>
    orgEntries.value.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0)
)
const weekHours = computed(() => (weekMinutes.value / 60).toFixed(1))
const weekTargetHours = computed(() => teamSize.value * 40)
const weekProgressPercent = computed(() =>
    weekTargetHours.value > 0
        ? Math.min(100, Math.round((Number(weekHours.value) / weekTargetHours.value) * 100))
        : 0
)
const todayMinutes = computed(() =>
    orgEntries.value
        .filter((entry) => entry.workDate === today)
        .reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0)
)
const todayEntriesCount = computed(
    () => orgEntries.value.filter((entry) => entry.workDate === today).length
)
const activeProjectsCount = computed(
    () => projects.value.filter((project) => project.isActive !== false).length
)
const teamSize = computed(() => members.value.filter((m) => m.isActive).length)

const projectNameById = computed(() => {
    const map = new Map<string, string>()
    for (const project of projects.value) map.set(project.id, project.name ?? "Unnamed project")
    return map
})
const clientNameById = computed(() => {
    const map = new Map<string, string>()
    for (const client of clients.value) map.set(client.id, client.name ?? "Unnamed client")
    return map
})

const hoursByProject = computed(() => {
    const visibleProjects = selectedClientFilter.value
        ? projects.value.filter((project) => (project.clientId ?? "unassigned") === selectedClientFilter.value)
        : projects.value
    const visibleProjectIds = new Set(visibleProjects.map((project) => project.id))

    const totals = new Map<string, number>()
    for (const entry of orgEntries.value) {
        if (!visibleProjectIds.has(entry.projectId)) continue
        totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + (entry.durationMinutes ?? 0))
    }
    const max = Math.max(...totals.values(), 0)
    return [...totals.entries()]
        .map(([projectId, totalMinutes]) => ({
            projectId,
            label: projectNameById.value.get(projectId) ?? "Unknown project",
            totalMinutes,
            percent: max ? Math.round((totalMinutes / max) * 100) : 0,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes)
        .slice(0, 6)
})

const hoursByClient = computed(() => {
    const projectClientMap = new Map<string, string>()
    for (const project of projects.value) {
        projectClientMap.set(project.id, project.clientId ?? "unassigned")
    }
    const totals = new Map<string, number>()
    for (const entry of orgEntries.value) {
        const clientId = projectClientMap.get(entry.projectId) ?? "unassigned"
        totals.set(clientId, (totals.get(clientId) ?? 0) + (entry.durationMinutes ?? 0))
    }
    const max = Math.max(...totals.values(), 0)
    return [...totals.entries()]
        .map(([clientId, totalMinutes]) => ({
            clientId,
            label:
                clientId === "unassigned"
                    ? "Unassigned"
                    : clientNameById.value.get(clientId) ?? "Unknown client",
            totalMinutes,
            percent: max ? Math.round((totalMinutes / max) * 100) : 0,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes)
        .slice(0, 6)
})

const weekTrend = computed(() => {
    const start = new Date(weekStartDate.value)
    const days: Array<{ date: string; label: string; totalMinutes: number; height: number }> = []
    const totalsByDate = new Map<string, number>()
    for (const entry of orgEntries.value) {
        totalsByDate.set(entry.workDate, (totalsByDate.get(entry.workDate) ?? 0) + (entry.durationMinutes ?? 0))
    }
    for (let i = 0; i < 7; i++) {
        const day = new Date(start)
        day.setDate(start.getDate() + i)
        const key = formatDateForInput(day)
        days.push({
            date: key,
            label: day.toLocaleDateString(undefined, { weekday: "short" }),
            totalMinutes: totalsByDate.get(key) ?? 0,
            height: 0,
        })
    }
    const max = Math.max(...days.map((d) => d.totalMinutes), 0)
    return days.map((day) => ({
        ...day,
        height: max ? Math.max(8, Math.round((day.totalMinutes / max) * 100)) : 8,
    }))
})

onMounted(() => loadDashboard())
watch(weekStartDate, () => {
    selectedClientFilter.value = null
    loadDashboard()
})

async function loadDashboard() {
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

        const [membersResult, projectsResult, clientsResult, orgTimesheetsResult] = await Promise.all([
            organizationsApi.getMembers(org.value.id),
            projectsApi.list(org.value.id),
            clientsApi.list(org.value.id),
            timesheetsApi.listOrg(org.value.id, {
                fromWeekStart: weekStartDate.value,
                toWeekStart: weekStartDate.value,
            }),
        ])

        members.value = membersResult
        projects.value = projectsResult
        clients.value = clientsResult

        orgTimesheets.value = orgTimesheetsResult
        if (orgTimesheets.value.length) {
            const entriesByTimesheet = await Promise.all(
                orgTimesheets.value.map((ts) => timesheetEntriesApi.list(org.value!.id, ts.id))
            )
            orgEntries.value = entriesByTimesheet.flat()
        } else {
            orgEntries.value = []
        }

        if (myMember.value && (myMember.value.role === 0 || myMember.value.role === 1)) {
            const pending = await timesheetsApi.listPendingApproval(org.value.id)
            pendingApprovalCount.value = pending.length
        } else {
            pendingApprovalCount.value = 0
        }
    } catch (e) {
        console.error("Load dashboard error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

function getWeekStart(date: Date) {
    const start = new Date(date)
    const day = start.getDay()
    const diff = (day + 6) % 7
    start.setDate(start.getDate() - diff)
    start.setHours(0, 0, 0, 0)
    return start
}

function formatDateForInput(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function formatShortDate(date: Date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatMinutes(total: number) {
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    if (!hours) return `${minutes}m`
    return `${hours}h ${minutes}m`
}

function shiftWeek(direction: -1 | 1) {
    const base = new Date(weekStartDate.value)
    base.setDate(base.getDate() + direction * 7)
    weekStartDate.value = formatDateForInput(getWeekStart(base))
}

function goToThisWeek() {
    weekStartDate.value = formatDateForInput(getWeekStart(new Date()))
}

function toggleClientFilter(clientId: string) {
    selectedClientFilter.value = selectedClientFilter.value === clientId ? null : clientId
}
</script>

<template>
    <section class="dashboard">
        <header class="dash-hero card">
            <div class="dash-hero__left">
                <p class="dash-hero__eyebrow">Workload pulse</p>
                <h1 class="dash-hero__title">Welcome back, {{ userDisplayName }}</h1>
                <p class="dash-hero__subtitle">{{ org?.name }} | {{ weekLabel }}</p>
                <div class="dash-hero__week-controls">
                    <button type="button" class="btn btn-secondary btn-sm" @click="shiftWeek(-1)">
                        Previous week
                    </button>
                    <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="isCurrentWeek"
                        @click="goToThisWeek"
                    >
                        This week
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" @click="shiftWeek(1)">
                        Next week
                    </button>
                </div>
            </div>
            <div class="dash-hero__right">
                <NuxtLink to="/track" class="btn btn-primary">Track time</NuxtLink>
                <NuxtLink to="/timesheets" class="btn btn-secondary">Open timesheet</NuxtLink>
                <NuxtLink v-if="isManagerOrAdmin" to="/approvals" class="btn btn-secondary">
                    Review approvals
                </NuxtLink>
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <section class="card dash-loading">
                <p class="muted">Loading dashboard...</p>
            </section>
        </template>

        <template v-else>
            <section class="dash-grid">
                <article class="card kpi kpi--primary">
                    <p class="kpi__label">Hours This Week</p>
                    <p class="kpi__value">{{ weekHours }}h</p>
                    <div class="kpi__progress">
                        <div class="kpi__progress-fill" :style="{ width: `${weekProgressPercent}%` }"></div>
                    </div>
                    <p class="kpi__meta">{{ weekProgressPercent }}% of {{ weekTargetHours }}h target</p>
                </article>

                <article class="card kpi">
                    <p class="kpi__label">Timesheets Submitted</p>
                    <p class="kpi__value">{{ statusSummaryLabel }}</p>
                    <p class="kpi__meta">{{ statusSummaryMeta }}</p>
                    <span class="kpi__pill" :class="statusToneClass">{{ statusSummaryPill }}</span>
                </article>

                <article class="card kpi">
                    <p class="kpi__label">Today</p>
                    <p class="kpi__value">{{ formatMinutes(todayMinutes) }}</p>
                    <p class="kpi__meta">{{ todayEntriesCount }} entries logged</p>
                </article>

                <article class="card kpi">
                    <p class="kpi__label">Workspace</p>
                    <p class="kpi__value">{{ activeProjectsCount }} active projects</p>
                    <p class="kpi__meta">{{ clients.length }} clients | {{ teamSize }} team members</p>
                </article>

                <article v-if="isManagerOrAdmin" class="card kpi kpi--accent">
                    <p class="kpi__label">Pending Approvals</p>
                    <p class="kpi__value">{{ pendingApprovalCount }}</p>
                    <p class="kpi__meta">Timesheets awaiting action</p>
                </article>
            </section>

            <section class="dash-charts">
                <article class="card panel">
                    <header class="panel__head">
                        <h2 class="panel__title">Week Trend</h2>
                        <p class="panel__subtitle">Hours logged per day</p>
                    </header>
                    <div class="trend">
                        <div v-for="day in weekTrend" :key="day.date" class="trend__col">
                            <div class="trend__bar-wrap">
                                <div
                                    class="trend__bar"
                                    :style="{
                                        height: `${day.height}%`,
                                        animationDelay: `${(new Date(day.date).getDay() + 1) * 40}ms`,
                                    }"
                                ></div>
                            </div>
                            <p class="trend__value">{{ formatMinutes(day.totalMinutes) }}</p>
                            <p class="trend__label">{{ day.label }}</p>
                        </div>
                    </div>
                </article>

                <article class="card panel">
                    <header class="panel__head">
                        <h2 class="panel__title">Project Mix</h2>
                        <p class="panel__subtitle">
                            {{
                                selectedClientFilter
                                    ? "Filtered by selected client"
                                    : "Where time is going this week"
                            }}
                        </p>
                    </header>
                    <ul v-if="hoursByProject.length" class="rank-list">
                        <NuxtLink
                            v-for="item in hoursByProject"
                            :key="item.projectId"
                            class="rank-list__item rank-list__item--link"
                            :to="{
                                path: '/track',
                                query: {
                                    projectId: item.projectId,
                                    date: weekStartDate,
                                },
                            }"
                        >
                            <div class="rank-list__row">
                                <span class="rank-list__name">{{ item.label }}</span>
                                <span class="rank-list__time">{{ formatMinutes(item.totalMinutes) }}</span>
                            </div>
                            <div class="rank-list__track">
                                <div class="rank-list__fill" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                        </NuxtLink>
                    </ul>
                    <p v-else class="muted">No project activity this week.</p>
                </article>

                <article class="card panel">
                    <header class="panel__head">
                        <h2 class="panel__title">Client Mix</h2>
                        <p class="panel__subtitle">Client-level distribution</p>
                    </header>
                    <ul v-if="hoursByClient.length" class="rank-list">
                        <button
                            v-for="item in hoursByClient"
                            :key="item.clientId"
                            type="button"
                            class="rank-list__item rank-list__item--button"
                            :class="{
                                'rank-list__item--active':
                                    selectedClientFilter === item.clientId,
                            }"
                            @click="toggleClientFilter(item.clientId)"
                        >
                            <div class="rank-list__row">
                                <span class="rank-list__name">{{ item.label }}</span>
                                <span class="rank-list__time">{{ formatMinutes(item.totalMinutes) }}</span>
                            </div>
                            <div class="rank-list__track rank-list__track--client">
                                <div class="rank-list__fill rank-list__fill--client" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                        </button>
                    </ul>
                    <p v-else class="muted">No client-linked activity this week.</p>
                </article>
            </section>
        </template>
    </section>
</template>

<style scoped>
.dashboard {
    display: grid;
    gap: var(--s-4);
}

.dash-hero {
    padding: var(--s-5);
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-4);
    background: var(--surface);
}

.dash-hero__eyebrow {
    margin: 0 0 var(--s-1) 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
    font-weight: 700;
}

.dash-hero__title {
    margin: 0;
    font-size: clamp(1.4rem, 3vw, 2rem);
}

.dash-hero__subtitle {
    margin: var(--s-1) 0 0 0;
    color: var(--text-2);
}

.dash-hero__week-controls {
    margin-top: var(--s-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}

.dash-hero__right {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}

.btn-sm {
    padding: 6px 10px;
    font-size: 0.875rem;
}

.dash-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--s-3);
}

.kpi {
    padding: var(--s-4);
    grid-column: span 3;
}

.kpi--primary {
    grid-column: span 6;
    border-left: 4px solid var(--primary);
}

.kpi--accent {
    border-left: 4px solid var(--accent);
}

.kpi__label {
    margin: 0;
    color: var(--text-2);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
}

.kpi__value {
    margin: var(--s-2) 0 var(--s-1) 0;
    font-size: clamp(1.2rem, 2.2vw, 1.85rem);
    font-weight: 800;
}

.kpi__meta {
    margin: 0;
    color: var(--text-2);
    font-size: 0.9rem;
}

.kpi__progress {
    width: 100%;
    height: 10px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    overflow: hidden;
    margin: var(--s-2) 0;
}

.kpi__progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 500ms ease;
}

.kpi__pill {
    display: inline-block;
    margin-top: var(--s-2);
    border-radius: var(--r-pill);
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 700;
}

.kpi__pill--neutral {
    background: var(--surface-2);
    color: var(--text-2);
}

.kpi__pill--info {
    background: var(--info-soft);
    color: var(--info);
}

.kpi__pill--success {
    background: var(--success-soft);
    color: var(--success);
}

.kpi__pill--warning {
    background: var(--warning-soft);
    color: var(--warning);
}

.dash-charts {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--s-3);
}

.panel {
    padding: var(--s-4);
}

.dash-charts > .panel:nth-child(1) {
    grid-column: span 6;
}

.dash-charts > .panel:nth-child(2),
.dash-charts > .panel:nth-child(3) {
    grid-column: span 3;
}

.panel__head {
    margin-bottom: var(--s-3);
}

.panel__title {
    margin: 0;
    font-size: 1rem;
}

.panel__subtitle {
    margin: var(--s-1) 0 0 0;
    color: var(--text-2);
    font-size: 0.875rem;
}

.trend {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--s-2);
    align-items: end;
    min-height: 210px;
}

.trend__col {
    display: grid;
    justify-items: center;
    gap: 6px;
}

.trend__bar-wrap {
    width: 100%;
    height: 130px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    display: flex;
    align-items: end;
    padding: 4px;
}

.trend__bar {
    width: 100%;
    border-radius: 8px;
    background: var(--primary);
    transform-origin: bottom;
    animation: bar-rise 420ms ease both;
}

.trend__value {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-2);
}

.trend__label {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
}

.rank-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--s-3);
}

.rank-list__item {
    display: block;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    padding: var(--s-2);
}

.rank-list__item--link {
    color: inherit;
    text-decoration: none;
}

.rank-list__item--button {
    text-align: left;
    cursor: pointer;
}

.rank-list__item--button:hover,
.rank-list__item--link:hover {
    background: var(--surface-2);
}

.rank-list__item--active {
    border-color: var(--primary);
    box-shadow: inset 0 0 0 1px var(--primary);
}

.rank-list__row {
    display: flex;
    justify-content: space-between;
    gap: var(--s-2);
    margin-bottom: 6px;
}

.rank-list__name {
    font-size: 0.875rem;
    font-weight: 600;
}

.rank-list__time {
    font-size: 0.8rem;
    color: var(--text-2);
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
    background: var(--primary);
    transform-origin: left;
    animation: bar-fill 600ms ease both;
}

.rank-list__track--client .rank-list__fill--client {
    background: var(--accent);
}

.dash-loading {
    padding: var(--s-5);
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@keyframes bar-rise {
    from {
        transform: scaleY(0.15);
        opacity: 0.4;
    }
    to {
        transform: scaleY(1);
        opacity: 1;
    }
}

@keyframes bar-fill {
    from {
        transform: scaleX(0);
        opacity: 0.5;
    }
    to {
        transform: scaleX(1);
        opacity: 1;
    }
}

@media (max-width: 1100px) {
    .kpi,
    .kpi--primary,
    .dash-charts > .panel:nth-child(1),
    .dash-charts > .panel:nth-child(2),
    .dash-charts > .panel:nth-child(3) {
        grid-column: span 12;
    }
}

@media (max-width: 760px) {
    .dash-hero {
        flex-direction: column;
        align-items: flex-start;
        padding: var(--s-4);
    }

    .trend {
        min-height: 170px;
    }

    .trend__bar-wrap {
        height: 95px;
    }
}
</style>
