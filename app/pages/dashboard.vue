<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref, watch } from "vue"
import { useAuth } from "~/composables/useAuth"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { clientsApi, type Client } from "~/api/clientsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { timesheetEntriesApi, type TimesheetEntry } from "~/api/timesheetEntriesApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const WEEKLY_TARGET_HOURS = 40
const RECENT_ENTRY_LIMIT = 3

const { token, user } = useAuth()

const org = ref<Organization | null>(null)
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const clients = ref<Client[]>([])

const loading = ref(true)
const error = ref<UiError | null>(null)

const currentWeekStart = computed(() => formatDateForInput(getWeekStart(new Date())))
const weekStartDate = ref(currentWeekStart.value)
const today = formatDateForInput(new Date())

const myWeekTimesheet = ref<Timesheet | null>(null)
const myWeekEntries = ref<TimesheetEntry[]>([])
const myRecentTimesheets = ref<Timesheet[]>([])
const myRecentEntries = ref<TimesheetEntry[]>([])
const previousWeekTimesheet = ref<Timesheet | null>(null)
const previousWeekEntries = ref<TimesheetEntry[]>([])

const orgTimesheets = ref<Timesheet[]>([])
const orgEntries = ref<TimesheetEntry[]>([])
const pendingApprovalCount = ref(0)

const roles = computed(() => getRolesFromToken(token.value))
const isEmployeeOnly = computed(() => roles.value.length > 0 && roles.value.every((role) => role === "employee"))
const previousWeekStart = computed(() => formatDateForInput(addDays(new Date(weekStartDate.value), -7)))
const weekLabel = computed(() => {
    const start = new Date(weekStartDate.value)
    const end = addDays(start, 6)
    return `${formatShortDate(start)} - ${formatShortDate(end)}`
})
const isCurrentWeek = computed(() => weekStartDate.value === currentWeekStart.value)

const myMember = computed(() => {
    if (!user.value?.userId) return null
    return members.value.find((member) => member.userId === user.value?.userId) ?? null
})
const userDisplayName = computed(() => {
    const fullName = [myMember.value?.firstName, myMember.value?.lastName].filter(Boolean).join(" ").trim()
    if (fullName) return fullName
    const email = user.value?.email ?? ""
    if (email.includes("@")) return email.split("@")[0]
    return "there"
})
const firstName = computed(() => userDisplayName.value.split(" ")[0] || userDisplayName.value)
const isManagerOrAdmin = computed(() => {
    const role = myMember.value?.role
    return role === 0 || role === 1
})

const projectNameById = computed(() => {
    const map = new Map<string, string>()
    for (const project of projects.value) map.set(project.id, project.name ?? "Unnamed project")
    return map
})
const projectClientIdById = computed(() => {
    const map = new Map<string, string>()
    for (const project of projects.value) {
        if (project.clientId) map.set(project.id, project.clientId)
    }
    return map
})
const clientNameById = computed(() => {
    const map = new Map<string, string>()
    for (const client of clients.value) map.set(client.id, client.name ?? "Unnamed client")
    return map
})

const employeeWeekMinutes = computed(() =>
    myWeekEntries.value.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0)
)
const employeeWeekHours = computed(() => (employeeWeekMinutes.value / 60).toFixed(1))
const employeeWeekProgress = computed(() =>
    Math.min(100, Math.round((Number(employeeWeekHours.value) / WEEKLY_TARGET_HOURS) * 100))
)
const employeeTopProjectSummary = computed(() => {
    const totals = new Map<string, number>()
    for (const entry of myWeekEntries.value) {
        totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + (entry.durationMinutes ?? 0))
    }
    const [projectId] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (!projectId) return "You have not logged any project time yet this week."
    const projectName = projectNameById.value.get(projectId) ?? "your top project"
    const clientId = projectClientIdById.value.get(projectId)
    const clientName = clientId ? clientNameById.value.get(clientId) : null
    return clientName
        ? `Most of your time was logged under Client: ${clientName}.`
        : `Most of your time was logged under ${projectName}.`
})
const employeeDailyOverview = computed(() => {
    const totalsByDate = new Map<string, number>()
    for (const entry of myWeekEntries.value) {
        totalsByDate.set(entry.workDate, (totalsByDate.get(entry.workDate) ?? 0) + (entry.durationMinutes ?? 0))
    }

    return Array.from({ length: 7 }, (_, index) => {
        const date = addDays(new Date(weekStartDate.value), index)
        const key = formatDateForInput(date)
        const totalMinutes = totalsByDate.get(key) ?? 0
        return {
            key,
            shortDay: date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
            dayOfMonth: date.getDate(),
            totalMinutes,
            isToday: key === today,
            isWeekend: [0, 6].includes(date.getDay()),
        }
    })
})
const highlightedDayKey = computed(() => {
    const todayCard = employeeDailyOverview.value.find((day) => day.isToday)
    if (todayCard) return todayCard.key
    return employeeDailyOverview.value.reduce((best, day) =>
        day.totalMinutes > best.totalMinutes ? day : best
    ).key
})
const recentEntryRows = computed(() => {
    const timesheetStatusById = new Map(myRecentTimesheets.value.map((sheet) => [sheet.id, sheet.status]))
    return [...myRecentEntries.value]
        .sort(sortEntriesByMostRecent)
        .slice(0, RECENT_ENTRY_LIMIT)
        .map((entry) => {
            const projectName = projectNameById.value.get(entry.projectId) ?? "Untitled project"
            const clientId = projectClientIdById.value.get(entry.projectId)
            const clientName = clientId ? clientNameById.value.get(clientId) : null
            const status = getTimesheetStatusMeta(timesheetStatusById.get(entry.timesheetId ?? ""))
            return {
                id: entry.id,
                projectName,
                clientName: clientName ?? org.value?.name ?? "No client assigned",
                durationLabel: formatHoursCompact(entry.durationMinutes ?? 0),
                timeLabel: formatEntryTimeRange(entry),
                icon: getProjectIcon(projectName),
                status,
            }
        })
})
const employeeProjectAllocation = computed(() => {
    const totals = new Map<string, number>()
    for (const entry of myWeekEntries.value) {
        totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + (entry.durationMinutes ?? 0))
    }
    const max = Math.max(...totals.values(), 0)
    return [...totals.entries()]
        .map(([projectId, totalMinutes]) => ({
            projectId,
            projectName: projectNameById.value.get(projectId) ?? "Untitled project",
            clientName: (() => {
                const clientId = projectClientIdById.value.get(projectId)
                return clientId ? clientNameById.value.get(clientId) ?? "Unassigned client" : "Unassigned client"
            })(),
            totalMinutes,
            percent: max ? Math.round((totalMinutes / max) * 100) : 0,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes)
        .slice(0, 3)
})
const reviewNeededCount = computed(() => {
    const status = previousWeekTimesheet.value?.status
    if (status === 2 || status === 1) return 0
    return previousWeekEntries.value.length
})
const reviewCardTitle = computed(() => {
    if (!reviewNeededCount.value) return "All set"
    return "Review Needed"
})
const reviewCardMessage = computed(() => {
    if (!reviewNeededCount.value) {
        return "Your last submitted timesheet is already in good shape."
    }
    if (previousWeekTimesheet.value?.status === 3) {
        return `You have ${reviewNeededCount.value} entries from last week that need updates before resubmission.`
    }
    return `You have ${reviewNeededCount.value} entries from last week that should be reviewed before submission.`
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
const weekMinutes = computed(() =>
    orgEntries.value.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0)
)
const weekHours = computed(() => (weekMinutes.value / 60).toFixed(1))
const activeProjectsCount = computed(() => projects.value.filter((project) => project.isActive !== false).length)
const teamSize = computed(() => members.value.filter((member) => member.isActive).length)
const weekTargetHours = computed(() => teamSize.value * WEEKLY_TARGET_HOURS)
const weekProgressPercent = computed(() =>
    weekTargetHours.value > 0
        ? Math.min(100, Math.round((Number(weekHours.value) / weekTargetHours.value) * 100))
        : 0
)
const dashboardStatusSummary = computed(() => {
    const total = statusSummary.value.total
    const items = [
        { key: "approved", label: "Approved", count: statusSummary.value.approved, icon: "mdi:check-circle", tone: "success" },
        { key: "submitted", label: "Submitted", count: statusSummary.value.submitted, icon: "mdi:progress-clock", tone: "warning" },
        { key: "draft", label: "Draft", count: statusSummary.value.draft, icon: "mdi:file-document-edit-outline", tone: "neutral" },
        { key: "rejected", label: "Rejected", count: statusSummary.value.rejected, icon: "mdi:close-circle", tone: "danger" },
    ]

    return items.map((item) => ({
        ...item,
        percent: total ? Math.round((item.count / total) * 100) : 0,
    }))
})
const managerTrend = computed(() => {
    const totalsByDate = new Map<string, number>()
    for (const entry of orgEntries.value) {
        totalsByDate.set(entry.workDate, (totalsByDate.get(entry.workDate) ?? 0) + (entry.durationMinutes ?? 0))
    }

    const days = Array.from({ length: 7 }, (_, index) => {
        const date = addDays(new Date(weekStartDate.value), index)
        const key = formatDateForInput(date)
        return {
            date: key,
            label: date.toLocaleDateString(undefined, { weekday: "short" }),
            totalMinutes: totalsByDate.get(key) ?? 0,
        }
    })
    const max = Math.max(...days.map((day) => day.totalMinutes), 0)
    return days.map((day) => ({
        ...day,
        height: max ? Math.max(12, Math.round((day.totalMinutes / max) * 100)) : 12,
    }))
})
const managerProjectAllocation = computed(() => buildProjectTotals(orgEntries.value).slice(0, 5))

onMounted(() => {
    void loadDashboard()
})

watch(weekStartDate, () => {
    void loadDashboard()
})

async function loadDashboard() {
    loading.value = true
    error.value = null
    try {
        const orgs = await organizationsApi.getMine()
        const firstOrg = orgs?.[0] ?? null
        if (!firstOrg?.id) {
            error.value = { title: "No organization", message: "Create an organization first." }
            return
        }

        org.value = firstOrg

        if (isEmployeeOnly.value) {
            await loadEmployeeDashboard(firstOrg.id)
        } else {
            await loadManagerDashboard(firstOrg.id)
        }
    } catch (e) {
        console.error("Load dashboard error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

async function loadEmployeeDashboard(organizationId: string) {
    const [membersResult, projectsResult, clientsResult, currentWeekTimesheets, previousWeekTimesheets, recentTimesheets] = await Promise.all([
        organizationsApi.getMembers(organizationId),
        projectsApi.list(organizationId, { isActive: true }),
        clientsApi.list(organizationId),
        timesheetsApi.listMine(organizationId, { fromWeekStart: weekStartDate.value, toWeekStart: weekStartDate.value }),
        timesheetsApi.listMine(organizationId, {
            fromWeekStart: previousWeekStart.value,
            toWeekStart: previousWeekStart.value,
        }),
        timesheetsApi.listMine(organizationId, {
            fromWeekStart: previousWeekStart.value,
            toWeekStart: weekStartDate.value,
        }),
    ])

    members.value = membersResult
    projects.value = projectsResult
    clients.value = clientsResult

    myWeekTimesheet.value = currentWeekTimesheets[0] ?? null
    previousWeekTimesheet.value = previousWeekTimesheets[0] ?? null
    myRecentTimesheets.value = recentTimesheets

    const [weekEntries, previousEntries, recentEntries] = await Promise.all([
        myWeekTimesheet.value ? timesheetEntriesApi.list(organizationId, myWeekTimesheet.value.id) : Promise.resolve([]),
        previousWeekTimesheet.value ? timesheetEntriesApi.list(organizationId, previousWeekTimesheet.value.id) : Promise.resolve([]),
        Promise.all(
            recentTimesheets.map((sheet) => timesheetEntriesApi.list(organizationId, sheet.id))
        ).then((rows) => rows.flat()),
    ])

    myWeekEntries.value = weekEntries
    previousWeekEntries.value = previousEntries
    myRecentEntries.value = recentEntries

    orgTimesheets.value = []
    orgEntries.value = []
    pendingApprovalCount.value = 0
}

async function loadManagerDashboard(organizationId: string) {
    const [membersResult, projectsResult, clientsResult, orgTimesheetsResult, pending] = await Promise.all([
        organizationsApi.getMembers(organizationId),
        projectsApi.list(organizationId),
        clientsApi.list(organizationId),
        timesheetsApi.listOrg(organizationId, { fromWeekStart: weekStartDate.value, toWeekStart: weekStartDate.value }),
        timesheetsApi.listPendingApproval(organizationId),
    ])

    members.value = membersResult
    projects.value = projectsResult
    clients.value = clientsResult
    orgTimesheets.value = orgTimesheetsResult
    pendingApprovalCount.value = pending.length

    orgEntries.value = orgTimesheetsResult.length
        ? (await Promise.all(orgTimesheetsResult.map((sheet) => timesheetEntriesApi.list(organizationId, sheet.id)))).flat()
        : []

    myWeekTimesheet.value = null
    myWeekEntries.value = []
    myRecentTimesheets.value = []
    myRecentEntries.value = []
    previousWeekTimesheet.value = null
    previousWeekEntries.value = []
}

function shiftWeek(direction: -1 | 1) {
    const base = new Date(weekStartDate.value)
    base.setDate(base.getDate() + direction * 7)
    const nextWeek = formatDateForInput(getWeekStart(base))
    weekStartDate.value = nextWeek > currentWeekStart.value ? currentWeekStart.value : nextWeek
}

function goToThisWeek() {
    if (isCurrentWeek.value) return
    weekStartDate.value = currentWeekStart.value
}

function buildProjectTotals(entries: TimesheetEntry[]) {
    const totals = new Map<string, number>()
    for (const entry of entries) {
        totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + (entry.durationMinutes ?? 0))
    }
    const max = Math.max(...totals.values(), 0)
    return [...totals.entries()]
        .map(([projectId, totalMinutes]) => ({
            projectId,
            label: projectNameById.value.get(projectId) ?? "Untitled project",
            totalMinutes,
            percent: max ? Math.round((totalMinutes / max) * 100) : 0,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes)
}

function getProjectIcon(projectName: string) {
    const label = projectName.toLowerCase()
    if (label.includes("design")) return "mdi:pencil-ruler"
    if (label.includes("front") || label.includes("dev") || label.includes("engineer")) return "mdi:code-tags"
    if (label.includes("plan") || label.includes("review")) return "mdi:account-group-outline"
    return "mdi:briefcase-outline"
}

function getTimesheetStatusMeta(status?: number) {
    if (status === 2) return { label: "Approved", className: "employee-entry__status--approved" }
    if (status === 1) return { label: "Submitted", className: "employee-entry__status--submitted" }
    if (status === 3) return { label: "Needs changes", className: "employee-entry__status--warning" }
    return { label: "Draft", className: "employee-entry__status--draft" }
}

function sortEntriesByMostRecent(a: TimesheetEntry, b: TimesheetEntry) {
    const aValue = `${a.workDate}T${a.startTime ?? "23:59"}`
    const bValue = `${b.workDate}T${b.startTime ?? "23:59"}`
    return bValue.localeCompare(aValue)
}

function formatEntryTimeRange(entry: TimesheetEntry) {
    if (entry.startTime && entry.endTime) return `${entry.startTime.slice(0, 5)} - ${entry.endTime.slice(0, 5)}`
    return formatDateMedium(entry.workDate)
}

function formatHoursCompact(totalMinutes: number) {
    return `${(totalMinutes / 60).toFixed(1)}h`
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
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
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

function formatDateMedium(value: string) {
    const date = new Date(value)
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatMinutes(total: number) {
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    if (!hours) return `${minutes}m`
    if (!minutes) return `${hours}h`
    return `${hours}h ${minutes}m`
}

function getRolesFromToken(rawToken: string | null | undefined) {
    if (!rawToken) return []
    const payload = decodeJwtPayload(rawToken)
    if (!payload || typeof payload !== "object") return []
    const claimKey = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
    const rawRoles = [payload[claimKey], payload.role, payload.roles]
    return rawRoles
        .flatMap((role) => normalizeRoles(role))
        .map((role) => role.toLowerCase())
        .filter(Boolean)
}

function normalizeRoles(value: unknown): string[] {
    if (!value) return []
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string")
    if (typeof value === "string") {
        return value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
    }
    return []
}

function decodeJwtPayload(rawToken: string) {
    const [, payload] = rawToken.split(".")
    if (!payload || typeof atob !== "function") return null
    try {
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
        return JSON.parse(atob(padded)) as Record<string, unknown>
    } catch {
        return null
    }
}
</script>

<template>
    <section class="dashboard-page">
        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <section v-else-if="loading" class="card dashboard-loading">
            <p>Loading dashboard…</p>
        </section>

        <template v-else-if="isEmployeeOnly">
            <section class="employee-dashboard">
                <header class="employee-hero card">
                    <div class="employee-hero__content">
                        <p class="employee-hero__eyebrow">Weekly overview</p>
                        <h1 class="employee-hero__title">
                            {{ employeeWeekHours }}
                            <span>hours</span>
                        </h1>
                        <p class="employee-hero__copy">
                            You've reached {{ employeeWeekProgress }}% of your weekly target.
                            {{ employeeTopProjectSummary }}
                        </p>
                        <div class="employee-hero__meta">
                            <span class="employee-hero__pill">
                                <Icon name="mdi:calendar-range" size="16" />
                                {{ weekLabel }}
                            </span>
                            <span>{{ firstName }}, keep the momentum going.</span>
                        </div>
                    </div>

                    <div class="employee-hero__actions">
                        <NuxtLink to="/track" class="employee-cta employee-cta--primary">
                            <Icon name="mdi:plus" size="22" />
                            New Time Entry
                        </NuxtLink>
                        <NuxtLink to="/timesheets" class="employee-cta employee-cta--secondary">
                            Submit Weekly
                        </NuxtLink>
                    </div>
                </header>

                <section class="employee-days card">
                    <button
                        type="button"
                        class="employee-days__nav"
                        @click="shiftWeek(-1)"
                    >
                        <Icon name="mdi:chevron-left" size="20" />
                    </button>
                    <div class="employee-days__grid">
                        <article
                            v-for="day in employeeDailyOverview"
                            :key="day.key"
                            class="employee-day"
                            :class="{
                                'employee-day--active': highlightedDayKey === day.key,
                                'employee-day--muted': day.isWeekend,
                            }"
                        >
                            <p class="employee-day__label">{{ day.shortDay }} {{ day.dayOfMonth }}</p>
                            <p class="employee-day__value">
                                {{ day.totalMinutes ? formatHoursCompact(day.totalMinutes) : '—' }}
                            </p>
                        </article>
                    </div>
                    <button
                        type="button"
                        class="employee-days__nav"
                        :disabled="isCurrentWeek"
                        @click="goToThisWeek"
                    >
                        <Icon name="mdi:calendar-today-outline" size="20" />
                    </button>
                </section>

                <section class="employee-grid">
                    <article class="employee-panel employee-panel--entries card">
                        <header class="employee-panel__head">
                            <div>
                                <h2>Recent Entries</h2>
                                <p>Your latest logged sessions across the last two weeks.</p>
                            </div>
                            <NuxtLink to="/timesheets" class="employee-panel__link">View History</NuxtLink>
                        </header>

                        <div v-if="recentEntryRows.length" class="employee-entry-list">
                            <article v-for="entry in recentEntryRows" :key="entry.id" class="employee-entry">
                                <div class="employee-entry__icon">
                                    <Icon :name="entry.icon" size="22" />
                                </div>
                                <div class="employee-entry__body">
                                    <h3>{{ entry.projectName }}</h3>
                                    <p>{{ entry.clientName }}</p>
                                </div>
                                <div class="employee-entry__meta">
                                    <strong>{{ entry.durationLabel }}</strong>
                                    <span>{{ entry.timeLabel }}</span>
                                </div>
                                <span class="employee-entry__status" :class="entry.status.className">
                                    {{ entry.status.label }}
                                </span>
                            </article>
                        </div>
                        <p v-else class="employee-empty">No recent entries yet. Start with a new time entry.</p>
                    </article>

                    <div class="employee-side-stack">
                        <article class="employee-panel card">
                            <header class="employee-panel__head employee-panel__head--compact">
                                <div>
                                    <h2>Project Allocation</h2>
                                    <p>Where your week is going.</p>
                                </div>
                            </header>

                            <div v-if="employeeProjectAllocation.length" class="allocation-list">
                                <article
                                    v-for="item in employeeProjectAllocation"
                                    :key="item.projectId"
                                    class="allocation-item"
                                >
                                    <div class="allocation-item__row">
                                        <div>
                                            <h3>{{ item.projectName }}</h3>
                                            <p>{{ item.clientName }}</p>
                                        </div>
                                        <strong>{{ formatHoursCompact(item.totalMinutes) }}</strong>
                                    </div>
                                    <div class="allocation-item__track">
                                        <div class="allocation-item__fill" :style="{ width: `${item.percent}%` }"></div>
                                    </div>
                                </article>
                            </div>
                            <p v-else class="employee-empty">No project allocation data yet for this week.</p>
                        </article>

                        <article class="employee-panel employee-panel--review card">
                            <div class="employee-panel__badge">
                                <Icon name="mdi:clipboard-alert-outline" size="18" />
                                {{ reviewCardTitle }}
                            </div>
                            <p class="employee-panel__review-copy">{{ reviewCardMessage }}</p>
                            <NuxtLink to="/timesheets" class="employee-panel__review-link">
                                Go to Timesheets
                                <Icon name="mdi:arrow-right" size="18" />
                            </NuxtLink>
                        </article>
                    </div>
                </section>
            </section>
        </template>

        <template v-else>
            <section class="manager-dashboard">
                <header class="manager-hero card">
                    <div>
                        <p class="manager-hero__eyebrow">Leadership snapshot</p>
                        <h1>Welcome back, {{ userDisplayName }}</h1>
                        <p>
                            Team-wide visibility into hours, timesheet health, and project delivery for
                            {{ org?.name }}.
                        </p>
                    </div>
                    <div class="manager-hero__actions">
                        <button type="button" class="btn btn-secondary" @click="shiftWeek(-1)">
                            Previous week
                        </button>
                        <button type="button" class="btn btn-secondary" :disabled="isCurrentWeek" @click="goToThisWeek">
                            This week
                        </button>
                        <NuxtLink v-if="isManagerOrAdmin" to="/approvals" class="btn btn-primary">
                            Review approvals
                        </NuxtLink>
                    </div>
                </header>

                <section class="manager-kpis">
                    <article class="manager-kpi card">
                        <p>Hours this week</p>
                        <strong>{{ weekHours }}h</strong>
                        <span>{{ weekProgressPercent }}% of {{ weekTargetHours }}h team target</span>
                    </article>
                    <article class="manager-kpi card">
                        <p>Pending approvals</p>
                        <strong>{{ pendingApprovalCount }}</strong>
                        <span>Timesheets awaiting action</span>
                    </article>
                    <article class="manager-kpi card">
                        <p>Active projects</p>
                        <strong>{{ activeProjectsCount }}</strong>
                        <span>{{ teamSize }} active team members</span>
                    </article>
                </section>

                <section class="manager-grid">
                    <article class="card manager-panel">
                        <header class="manager-panel__head">
                            <h2>Weekly trend</h2>
                            <span>{{ weekLabel }}</span>
                        </header>
                        <div class="manager-trend">
                            <article v-for="day in managerTrend" :key="day.date" class="manager-trend__day">
                                <span>{{ formatMinutes(day.totalMinutes) }}</span>
                                <div class="manager-trend__bar-wrap">
                                    <div class="manager-trend__bar" :style="{ height: `${day.height}%` }"></div>
                                </div>
                                <strong>{{ day.label }}</strong>
                            </article>
                        </div>
                    </article>

                    <article class="card manager-panel">
                        <header class="manager-panel__head">
                            <h2>Timesheet status summary</h2>
                            <span>{{ statusSummary.total }} total</span>
                        </header>
                        <div class="manager-status-list">
                            <article
                                v-for="item in dashboardStatusSummary"
                                :key="item.key"
                                class="manager-status-item"
                            >
                                <div>
                                    <strong>{{ item.label }}</strong>
                                    <p>{{ item.count }} timesheets</p>
                                </div>
                                <span>{{ item.percent }}%</span>
                            </article>
                        </div>
                    </article>

                    <article class="card manager-panel">
                        <header class="manager-panel__head">
                            <h2>Top project allocation</h2>
                            <span>Selected week</span>
                        </header>
                        <div v-if="managerProjectAllocation.length" class="allocation-list">
                            <article v-for="item in managerProjectAllocation" :key="item.projectId" class="allocation-item">
                                <div class="allocation-item__row">
                                    <h3>{{ item.label }}</h3>
                                    <strong>{{ formatMinutes(item.totalMinutes) }}</strong>
                                </div>
                                <div class="allocation-item__track">
                                    <div class="allocation-item__fill" :style="{ width: `${item.percent}%` }"></div>
                                </div>
                            </article>
                        </div>
                        <p v-else class="employee-empty">No project activity recorded this week.</p>
                    </article>
                </section>
            </section>
        </template>
    </section>
</template>

<style scoped>
.dashboard-page {
    display: grid;
    gap: var(--s-4);
}

.dashboard-loading,
.employee-hero,
.employee-days,
.employee-panel,
.manager-hero,
.manager-kpi,
.manager-panel {
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
}

.alert {
    border-radius: var(--r-lg);
    border: 1px solid color-mix(in srgb, var(--danger) 20%, white);
    background: color-mix(in srgb, var(--danger-soft) 78%, white);
    padding: var(--s-4);
}

.alert__title {
    font-weight: 700;
    margin-bottom: 4px;
}

.dashboard-loading {
    padding: var(--s-5);
}

.employee-dashboard,
.manager-dashboard {
    display: grid;
    gap: var(--s-4);
}

.employee-hero {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: var(--s-5);
    padding: clamp(20px, 3vw, 32px);
    background: linear-gradient(135deg, color-mix(in srgb, var(--primary-soft) 72%, white), white 65%);
}

.employee-hero__content {
    display: grid;
    gap: var(--s-3);
    max-width: 720px;
}

.employee-hero__eyebrow,
.manager-hero__eyebrow {
    margin: 0;
    color: var(--primary);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.8rem;
}

.employee-hero__title {
    margin: 0;
    font-size: clamp(2.4rem, 5vw, 4.5rem);
    line-height: 0.95;
    color: var(--text-1);
}

.employee-hero__title span {
    font-size: clamp(1.2rem, 2.2vw, 2rem);
    font-weight: 500;
    color: var(--text-3);
    margin-left: 0.35rem;
}

.employee-hero__copy,
.employee-panel__head p,
.employee-panel__review-copy,
.employee-empty,
.manager-hero p,
.manager-kpi span,
.manager-status-item p {
    margin: 0;
    color: var(--text-2);
    line-height: 1.6;
}

.employee-hero__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
    align-items: center;
    color: var(--text-2);
}

.employee-hero__pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--primary) 8%, white);
    color: var(--primary);
    font-weight: 700;
}

.employee-hero__actions {
    display: grid;
    gap: var(--s-3);
    align-content: center;
    min-width: 230px;
}

.employee-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-radius: 18px;
    padding: 18px 22px;
    font-weight: 700;
    font-size: 1rem;
    text-decoration: none;
    transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.employee-cta:hover {
    transform: translateY(-1px);
    text-decoration: none;
}

.employee-cta--primary {
    background: var(--primary);
    color: white;
    box-shadow: 0 12px 24px color-mix(in srgb, var(--primary) 18%, transparent);
}

.employee-cta--primary:hover {
    background: var(--primary-hover);
}

.employee-cta--secondary {
    background: white;
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 16%, white);
}

.employee-days {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-3);
    align-items: center;
    padding: 12px;
    background: color-mix(in srgb, var(--primary-soft) 58%, white);
}

.employee-days__nav {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: white;
    color: var(--primary);
    display: grid;
    place-items: center;
    cursor: pointer;
}

.employee-days__nav:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.employee-days__grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
}

.employee-day {
    padding: 18px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid transparent;
    text-align: center;
}

.employee-day--active {
    background: color-mix(in srgb, var(--primary) 82%, white);
    color: white;
    box-shadow: 0 16px 24px color-mix(in srgb, var(--primary) 18%, transparent);
}

.employee-day--muted {
    opacity: 0.65;
}

.employee-day__label,
.employee-day__value {
    margin: 0;
}

.employee-day__label {
    font-size: 0.82rem;
    letter-spacing: 0.03em;
}

.employee-day__value {
    margin-top: 12px;
    font-size: 1.25rem;
    font-weight: 800;
}

.employee-grid,
.manager-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.9fr) minmax(280px, 0.9fr);
    gap: var(--s-4);
}

.employee-panel {
    padding: var(--s-4);
    background: white;
}

.employee-panel--entries {
    min-height: 100%;
}

.employee-side-stack {
    display: grid;
    gap: var(--s-4);
}

.employee-panel__head,
.manager-panel__head {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    align-items: flex-start;
    margin-bottom: var(--s-4);
}

.employee-panel__head h2,
.manager-panel__head h2,
.manager-hero h1,
.allocation-item h3,
.employee-entry__body h3 {
    margin: 0;
}

.employee-panel__head--compact {
    margin-bottom: var(--s-3);
}

.employee-panel__link,
.employee-panel__review-link {
    color: var(--primary);
    font-weight: 700;
}

.employee-entry-list {
    display: grid;
    gap: 12px;
}

.employee-entry {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: var(--s-3);
    align-items: center;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface-2) 55%, white);
}

.employee-entry__icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--primary) 10%, white);
    color: var(--primary);
}

.employee-entry__body p,
.allocation-item p {
    margin: 4px 0 0;
    color: var(--text-2);
}

.employee-entry__meta {
    text-align: right;
    display: grid;
    gap: 4px;
}

.employee-entry__meta span {
    color: var(--text-3);
    font-size: 0.92rem;
}

.employee-entry__status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 10px 14px;
    border-radius: var(--r-pill);
    font-size: 0.8rem;
    font-weight: 700;
    min-width: 112px;
}

.employee-entry__status--draft {
    background: color-mix(in srgb, var(--primary) 12%, white);
    color: var(--primary);
}

.employee-entry__status--submitted {
    background: color-mix(in srgb, var(--info) 15%, white);
    color: var(--info);
}

.employee-entry__status--approved {
    background: color-mix(in srgb, var(--success) 16%, white);
    color: var(--success);
}

.employee-entry__status--warning {
    background: color-mix(in srgb, var(--warning) 14%, white);
    color: var(--warning);
}

.allocation-list {
    display: grid;
    gap: 16px;
}

.allocation-item__row {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    align-items: center;
}

.allocation-item__track {
    margin-top: 12px;
    height: 8px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--primary) 8%, white);
    overflow: hidden;
}

.allocation-item__fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 72%, white));
}

.employee-panel--review {
    background: linear-gradient(180deg, color-mix(in srgb, var(--primary-soft) 48%, white), white);
    border-left: 5px solid var(--primary);
}

.employee-panel__badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--primary);
    font-weight: 800;
    margin-bottom: var(--s-3);
}

.employee-panel__review-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: var(--s-3);
}

.manager-hero,
.manager-kpis,
.manager-grid {
    display: grid;
    gap: var(--s-4);
}

.manager-hero {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: var(--s-5);
}

.manager-hero__actions,
.manager-kpis {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
}

.manager-kpi {
    flex: 1 1 220px;
    padding: var(--s-4);
    display: grid;
    gap: 8px;
}

.manager-kpi p {
    margin: 0;
    color: var(--text-2);
}

.manager-kpi strong {
    font-size: 2rem;
}

.manager-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.manager-panel {
    padding: var(--s-4);
}

.manager-panel__head span {
    color: var(--text-3);
}

.manager-trend {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 12px;
    min-height: 260px;
    align-items: end;
}

.manager-trend__day {
    display: grid;
    justify-items: center;
    gap: 10px;
}

.manager-trend__day span,
.manager-trend__day strong {
    font-size: 0.85rem;
}

.manager-trend__bar-wrap {
    width: 100%;
    height: 160px;
    display: flex;
    align-items: flex-end;
}

.manager-trend__bar {
    width: 100%;
    border-radius: 16px 16px 6px 6px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 72%, white), var(--primary));
}

.manager-status-list {
    display: grid;
    gap: 12px;
}

.manager-status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--surface-2) 55%, white);
}

.manager-status-item span {
    font-weight: 800;
    color: var(--primary);
}

@media (max-width: 1100px) {
    .employee-grid,
    .manager-grid {
        grid-template-columns: 1fr;
    }

    .manager-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 900px) {
    .employee-hero,
    .manager-hero {
        grid-template-columns: 1fr;
        display: grid;
    }

    .employee-hero__actions {
        min-width: 0;
    }

    .employee-days {
        grid-template-columns: 1fr;
    }

    .employee-days__grid,
    .manager-trend {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .employee-entry {
        grid-template-columns: auto 1fr;
    }

    .employee-entry__meta,
    .employee-entry__status {
        grid-column: 2;
        justify-self: start;
        text-align: left;
    }
}

@media (max-width: 640px) {
    .employee-days__grid,
    .manager-trend {
        grid-template-columns: 1fr;
    }

    .employee-entry {
        grid-template-columns: 1fr;
    }

    .employee-entry__meta,
    .employee-entry__status {
        grid-column: auto;
    }
}
</style>
