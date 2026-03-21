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

const currentWeekStart = computed(() => formatDateForInput(getWeekStart(new Date())))
const weekStartDate = ref(currentWeekStart.value)
const today = formatDateForInput(new Date())
const selectedClientFilter = ref<string | null>(null)

const weekLabel = computed(() => {
    const start = new Date(weekStartDate.value)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return `${formatShortDate(start)} - ${formatShortDate(end)}`
})
const isCurrentWeek = computed(() => weekStartDate.value === currentWeekStart.value)

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
    if (!statusSummary.value.total) return "kpi-badge--neutral"
    if (statusSummary.value.submitted === statusSummary.value.total) return "kpi-badge--success"
    if (statusSummary.value.rejected > 0) return "kpi-badge--warning"
    return "kpi-badge--info"
})

const weekMinutes = computed(() =>
    orgEntries.value.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0)
)
const weekHours = computed(() => (weekMinutes.value / 60).toFixed(1))
const activeProjectsCount = computed(
    () => projects.value.filter((project) => project.isActive !== false).length
)
const teamSize = computed(() => members.value.filter((m) => m.isActive).length)
const weekTargetHours = computed(() => teamSize.value * 40)
const weekProgressPercent = computed(() =>
    weekTargetHours.value > 0
        ? Math.min(100, Math.round((Number(weekHours.value) / weekTargetHours.value) * 100))
        : 0
)
const avgHoursPerMember = computed(() => {
    if (!teamSize.value) return "0.0"
    return (Number(weekHours.value) / teamSize.value).toFixed(1)
})
const todayMinutes = computed(() =>
    orgEntries.value
        .filter((entry) => entry.workDate === today)
        .reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0)
)
const todayEntriesCount = computed(
    () => orgEntries.value.filter((entry) => entry.workDate === today).length
)

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
const selectedClientName = computed(() => {
    if (!selectedClientFilter.value) return ""
    return clientNameById.value.get(selectedClientFilter.value) ?? ""
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

const dashboardStatusSummary = computed(() => {
    const total = statusSummary.value.total
    const items = [
        {
            key: "approved",
            label: "Approved",
            count: statusSummary.value.approved,
            icon: "mdi:check-circle",
            tone: "success",
        },
        {
            key: "submitted",
            label: "Submitted",
            count: statusSummary.value.submitted,
            icon: "mdi:progress-clock",
            tone: "warning",
        },
        {
            key: "draft",
            label: "Draft",
            count: statusSummary.value.draft,
            icon: "mdi:file-document-edit-outline",
            tone: "neutral",
        },
        {
            key: "rejected",
            label: "Rejected",
            count: statusSummary.value.rejected,
            icon: "mdi:close-circle",
            tone: "danger",
        },
    ]

    return items.map((item) => ({
        ...item,
        percent: total ? Math.round((item.count / total) * 100) : 0,
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
    const nextWeek = formatDateForInput(getWeekStart(base))
    weekStartDate.value = nextWeek > currentWeekStart.value ? currentWeekStart.value : nextWeek
}

function goToThisWeek() {
    if (isCurrentWeek.value) return
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
                <p class="dash-hero__eyebrow">Executive dashboard</p>
                <h1 class="dash-hero__title">Welcome back, {{ userDisplayName }}</h1>
                <p class="dash-hero__subtitle">
                    Real-time visibility into team workload, approvals, and project delivery for
                    {{ org?.name }}.
                </p>
                <div class="dash-hero__meta">
                    <span class="dash-hero__range-pill">
                        <Icon name="mdi:calendar-range" size="16" />
                        {{ weekLabel }}
                    </span>
                    <span class="dash-hero__meta-text">
                        {{ teamSize }} active team members • {{ activeProjectsCount }} active projects
                    </span>
                </div>
                <div class="dash-hero__week-controls">
                    <button type="button" class="btn btn-secondary btn-sm btn-inline" @click="shiftWeek(-1)">
                        <Icon name="mdi:chevron-left" size="18" />
                        Previous week
                    </button>
                    <button
                        type="button"
                        class="btn btn-secondary btn-sm btn-inline"
                        :disabled="isCurrentWeek"
                        @click="goToThisWeek"
                    >
                        <Icon name="mdi:calendar-today-outline" size="18" />
                        This week
                    </button>
                </div>
            </div>
            <div class="dash-hero__right">
                <NuxtLink to="/track" class="btn btn-primary btn-inline">
                    <Icon name="mdi:plus" size="18" />
                    Track time
                </NuxtLink>
                <NuxtLink to="/timesheets" class="btn btn-secondary btn-inline">
                    <Icon name="mdi:calendar-text-outline" size="18" />
                    Open timesheet
                </NuxtLink>
                <NuxtLink v-if="isManagerOrAdmin" to="/approvals" class="btn btn-secondary btn-inline">
                    <Icon name="mdi:clipboard-check-outline" size="18" />
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
            <section class="dashboard-kpis">
                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Hours this week</p>
                        <p class="kpi-card__value">{{ weekHours }}h</p>
                        <p class="kpi-card__meta">
                            {{ weekProgressPercent }}% of the {{ weekTargetHours }}h weekly capacity target
                        </p>
                        <div class="kpi-progress">
                            <div class="kpi-progress__fill" :style="{ width: `${weekProgressPercent}%` }"></div>
                        </div>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--primary">
                        <Icon name="mdi:clock-outline" size="24" />
                    </span>
                </article>

                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Timesheet coverage</p>
                        <p class="kpi-card__value">{{ statusSummaryLabel }}</p>
                        <p class="kpi-card__meta">{{ statusSummaryMeta }}</p>
                        <span class="kpi-badge" :class="statusToneClass">{{ statusSummaryPill }}</span>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--info">
                        <Icon name="mdi:file-document-check-outline" size="24" />
                    </span>
                </article>

                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Today's activity</p>
                        <p class="kpi-card__value">{{ formatMinutes(todayMinutes) }}</p>
                        <p class="kpi-card__meta">
                            {{ todayEntriesCount }} entries logged today • {{ avgHoursPerMember }}h average per active member
                        </p>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--accent">
                        <Icon name="mdi:chart-timeline-variant" size="24" />
                    </span>
                </article>

                <article class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Workspace footprint</p>
                        <p class="kpi-card__value">{{ activeProjectsCount }}</p>
                        <p class="kpi-card__meta">{{ clients.length }} clients • {{ teamSize }} active team members</p>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--neutral">
                        <Icon name="mdi:briefcase-outline" size="24" />
                    </span>
                </article>

                <article v-if="isManagerOrAdmin" class="card kpi-card">
                    <div>
                        <p class="kpi-card__label">Pending approvals</p>
                        <p class="kpi-card__value">{{ pendingApprovalCount }}</p>
                        <p class="kpi-card__meta">Timesheets currently waiting for manager action</p>
                    </div>
                    <span class="kpi-card__icon kpi-card__icon--success">
                        <Icon name="mdi:clipboard-check-outline" size="24" />
                    </span>
                </article>
            </section>

            <section class="dashboard-content">
                <article class="card report-panel report-panel--trend">
                    <header class="report-panel__head report-panel__head--spread">
                        <div>
                            <p class="dashboard-section-label">Trend</p>
                            <h2 class="dashboard-section-title">Weekly hour trend</h2>
                            <p class="report-panel__subtitle">
                                Daily logged time for the selected week, modeled after the reports view.
                            </p>
                        </div>
                        <div class="report-panel__legend">
                            <span class="report-panel__legend-dot"></span>
                            Logged time
                        </div>
                    </header>
                    <div class="trend-chart trend-chart--daily">
                        <div v-for="day in weekTrend" :key="day.date" class="trend-chart__item">
                            <p class="trend-chart__value">{{ formatMinutes(day.totalMinutes) }}</p>
                            <div class="trend-chart__bar-wrap">
                                <div
                                    class="trend-chart__bar"
                                    :style="{
                                        height: `${day.height}%`,
                                        animationDelay: `${(new Date(day.date).getDay() + 1) * 40}ms`,
                                    }"
                                ></div>
                            </div>
                            <p class="trend-chart__label">{{ day.label }}</p>
                        </div>
                    </div>
                </article>

                <article class="card report-panel report-panel--status">
                    <header class="report-panel__head">
                        <p class="dashboard-section-label">Statuses</p>
                        <h2 class="dashboard-section-title">Timesheet status summary</h2>
                        <p class="report-panel__subtitle">
                            Current state of all timesheets inside the selected week.
                        </p>
                    </header>
                    <div class="status-list">
                        <div
                            v-for="item in dashboardStatusSummary"
                            :key="item.key"
                            class="status-list__item"
                            :class="`status-list__item--${item.tone}`"
                        >
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
                </article>

                <article class="card report-panel">
                    <header class="report-panel__head">
                        <p class="dashboard-section-label">Projects</p>
                        <h2 class="dashboard-section-title">Hours by project</h2>
                        <p class="report-panel__subtitle">
                            Top project allocation for this week, with quick links into tracking.
                        </p>
                    </header>
                    <ul v-if="hoursByProject.length" class="rank-list">
                        <li v-for="item in hoursByProject" :key="item.projectId" class="rank-list__item">
                            <div class="rank-list__row">
                                <span class="rank-list__name">{{ item.label }}</span>
                                <strong class="rank-list__value">{{ formatMinutes(item.totalMinutes) }}</strong>
                            </div>
                            <div class="rank-list__track">
                                <div class="rank-list__fill" :style="{ width: `${item.percent}%` }"></div>
                            </div>
                            <NuxtLink
                                class="rank-list__cta"
                                :to="{
                                    path: '/track',
                                    query: {
                                        projectId: item.projectId,
                                        date: weekStartDate,
                                    },
                                }"
                            >
                                Open in track
                            </NuxtLink>
                        </li>
                    </ul>
                    <p v-else class="muted">No project activity this week.</p>
                </article>

                <article class="card report-panel">
                    <header class="report-panel__head">
                        <p class="dashboard-section-label">Clients</p>
                        <h2 class="dashboard-section-title">Hours by client</h2>
                        <p class="report-panel__subtitle">
                            Click a client to focus the project list on that account.
                        </p>
                    </header>
                    <ul v-if="hoursByClient.length" class="rank-list">
                        <li
                            v-for="item in hoursByClient"
                            :key="item.clientId"
                            class="rank-list__item rank-list__item--interactive"
                            :class="{ 'rank-list__item--active': selectedClientFilter === item.clientId }"
                        >
                            <button type="button" class="rank-list__button" @click="toggleClientFilter(item.clientId)">
                                <div class="rank-list__row">
                                    <span class="rank-list__name">{{ item.label }}</span>
                                    <strong class="rank-list__value">{{ formatMinutes(item.totalMinutes) }}</strong>
                                </div>
                                <div class="rank-list__track">
                                    <div class="rank-list__fill rank-list__fill--client" :style="{ width: `${item.percent}%` }"></div>
                                </div>
                            </button>
                        </li>
                    </ul>
                    <p v-else class="muted">No client-linked activity this week.</p>
                    <p class="report-panel__helper" :class="{ 'report-panel__helper--active': Boolean(selectedClientFilter) }">
                        {{
                            selectedClientFilter
                                ? `Project list filtered to ${selectedClientName || 'the selected client'}.`
                                : 'Showing all clients.'
                        }}
                    </p>
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
    align-items: flex-start;
    gap: var(--s-4);
    background: var(--surface);
}

.dash-hero__left {
    display: grid;
    gap: var(--s-2);
}

.dash-hero__eyebrow,
.dashboard-section-label {
    margin: 0;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
    font-weight: 700;
}

.dash-hero__title {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2.2rem);
    line-height: 1.1;
}

.dash-hero__subtitle,
.dash-hero__meta-text,
.kpi-card__meta,
.report-panel__subtitle,
.report-panel__helper,
.muted {
    margin: 0;
    color: var(--text-2);
}

.dash-hero__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    align-items: center;
}

.dash-hero__range-pill {
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

.dash-hero__week-controls,
.dash-hero__right {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}

.dash-hero__week-controls {
    margin-top: var(--s-1);
}

.dash-hero__right {
    justify-content: flex-end;
}

.btn-sm {
    padding: 6px 10px;
    font-size: 0.875rem;
}

.btn-inline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.dashboard-kpis,
.dashboard-content {
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
    font-size: clamp(1.2rem, 2.2vw, 1.9rem);
    font-weight: 800;
}

.kpi-card__meta {
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

.kpi-card__icon--success {
    background: var(--success-soft);
    color: var(--success);
}

.kpi-progress {
    width: 100%;
    height: 10px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    overflow: hidden;
    margin-top: var(--s-3);
}

.kpi-progress__fill {
    height: 100%;
    background: var(--primary);
    transition: width 500ms ease;
}

.kpi-badge {
    display: inline-flex;
    align-items: center;
    margin-top: var(--s-2);
    border-radius: var(--r-pill);
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 700;
}

.kpi-badge--neutral {
    background: var(--surface-2);
    color: var(--text-2);
}

.kpi-badge--info {
    background: var(--info-soft);
    color: var(--info);
}

.kpi-badge--success {
    background: var(--success-soft);
    color: var(--success);
}

.kpi-badge--warning {
    background: var(--warning-soft);
    color: var(--warning);
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

.dashboard-section-title {
    margin: 4px 0 0 0;
    font-size: 1rem;
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
    font-size: 0.875rem;
}

.report-panel__helper {
    font-size: 0.875rem;
}

.report-panel__helper--active {
    color: var(--primary);
    font-weight: 600;
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
    grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
    align-items: end;
    gap: var(--s-2);
}

.trend-chart--daily {
    min-height: 280px;
}

.trend-chart__item {
    display: grid;
    gap: 8px;
    justify-items: center;
}

.trend-chart__bar-wrap {
    width: 100%;
    height: 210px;
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
    min-height: 12px;
    border-radius: 8px;
    background: var(--primary);
    transform-origin: bottom;
    animation: bar-rise 420ms ease both;
}

.trend-chart__value,
.trend-chart__label {
    margin: 0;
    text-align: center;
}

.trend-chart__value {
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

.rank-list__item--interactive {
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    padding: 4px;
}

.rank-list__item--active {
    border-color: var(--primary);
    box-shadow: inset 0 0 0 1px var(--primary);
}

.rank-list__button {
    width: 100%;
    border: 0;
    background: transparent;
    padding: var(--s-2);
    display: grid;
    gap: 8px;
    text-align: left;
    cursor: pointer;
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
    transform-origin: left;
    animation: bar-fill 600ms ease both;
}

.rank-list__fill--client {
    background: var(--accent);
}

.rank-list__cta {
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
}

.rank-list__cta:hover {
    text-decoration: underline;
}

.dash-loading {
    padding: var(--s-5);
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
    .dash-hero {
        flex-direction: column;
        align-items: flex-start;
        padding: var(--s-4);
    }

    .dash-hero__right {
        justify-content: flex-start;
    }

    .dashboard-kpis,
    .dashboard-content {
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
        min-height: 250px;
    }

    .trend-chart__bar-wrap {
        height: 160px;
    }

    .status-list__item {
        align-items: flex-start;
    }
}
</style>
