<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { trackerApi, type ActiveTimerSession } from "~/api/trackerApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { timesheetEntriesApi, type TimesheetEntry } from "~/api/timesheetEntriesApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const org = ref<Organization | null>(null)
const route = useRoute()
const projects = ref<Project[]>([])
const timesheet = ref<Timesheet | null>(null)
const entries = ref<TimesheetEntry[]>([])

const loading = ref(true)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const error = ref<UiError | null>(null)
const localError = ref<UiError | null>(null)

const workDate = ref(formatDateForInput(new Date()))
const selectedProjectId = ref("")
const notes = ref("")
const manualMinutes = ref<number | null>(null)

const running = ref(false)
const sessionStartedAt = ref<Date | null>(null)
const activeSessionId = ref<string | null>(null)
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
let notesSyncTimer: ReturnType<typeof setTimeout> | null = null

const WEEKLY_GOAL_MINUTES = 40 * 60

const organizationId = computed(() => org.value?.id ?? "")
const activeProjects = computed(() =>
    projects.value
        .filter((project) => project.isActive !== false)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
)
const todayEntries = computed(() =>
    entries.value
        .filter((entry) => entry.workDate === workDate.value)
        .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
)
const todayTotalMinutes = computed(() =>
    todayEntries.value.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0)
)
const weekTotalMinutes = computed(() =>
    entries.value.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0)
)
const selectedDateLabel = computed(() => formatDateLong(workDate.value))
const hasProjects = computed(() => activeProjects.value.length > 0)
const elapsedSeconds = computed(() => {
    if (!running.value || !sessionStartedAt.value) return 0
    return Math.max(0, Math.floor((now.value - sessionStartedAt.value.getTime()) / 1000))
})
const elapsedDisplay = computed(() => formatSecondsAsClock(elapsedSeconds.value))
const canTrack = computed(() => !!selectedProjectId.value && !!timesheet.value?.id)
const timesheetStatusLabel = computed(() => {
    const status = timesheet.value?.status
    if (status === 1) return "Submitted"
    if (status === 2) return "Approved"
    if (status === 3) return "Rejected"
    return "Draft"
})
const isTimesheetEditable = computed(() => {
    const status = timesheet.value?.status
    return status === undefined || status === 0 || status === 3
})
const selectedProject = computed(
    () => projects.value.find((project) => project.id === selectedProjectId.value) ?? null
)
const selectedProjectClient = computed(
    () => selectedProject.value?.clientName || org.value?.name || "No client assigned"
)
const heroStatusLabel = computed(() => (running.value ? "Currently tracking" : "Ready to track"))
const heroTitle = computed(() => selectedProject.value?.name || "Choose a project to begin")
const heroSubtitle = computed(() => {
    if (running.value && notes.value.trim()) return notes.value.trim()
    if (selectedProject.value && notes.value.trim()) return notes.value.trim()
    if (running.value) return "Timer is active for your current work session."
    return "Select a project, set a date, and start capturing time."
})
const weeklyGoalProgress = computed(() =>
    Math.min(100, Math.round((weekTotalMinutes.value / WEEKLY_GOAL_MINUTES) * 100))
)
const weeklyGoalLabel = computed(
    () => `${formatHoursValue(weekTotalMinutes.value)} / 40h`
)
const averageEntryLabel = computed(() => {
    if (!todayEntries.value.length) return "No entries yet"
    const average = Math.round(todayTotalMinutes.value / todayEntries.value.length)
    return `${formatMinutes(average)} avg/session`
})
const focusScore = computed(() => {
    const entryBonus = Math.min(todayEntries.value.length * 7, 28)
    const trackingRatio = Math.min(todayTotalMinutes.value / (8 * 60), 1)
    return Math.min(99, Math.round(trackingRatio * 72 + entryBonus))
})
const focusDeltaLabel = computed(() => {
    if (focusScore.value >= 85) return "Excellent pace today"
    if (focusScore.value >= 60) return "Solid rhythm this session"
    if (focusScore.value > 0) return "Keep building momentum"
    return "Start tracking to generate a score"
})

onMounted(() => loadTrackerData())
onBeforeUnmount(() => {
    stopTicker()
    clearNotesSyncTimer()
})

watch(workDate, async (value, previous) => {
    if (!value || value === previous) return
    await ensureTimesheetForSelectedWeek()
})

watch(
    () => [route.query.date, route.query.projectId],
    async () => {
        applyQueryPrefill()
        await ensureTimesheetForSelectedWeek()
    }
)

watch(notes, () => {
    if (!running.value || !organizationId.value || !activeSessionId.value) return
    queueSessionNotesSync()
})

async function loadTrackerData() {
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

        const activeSession = await getActiveSession(firstOrg.id)
        if (activeSession) {
            applyActiveSession(activeSession)
        }

        const [projectsResult, timesheetResult] = await Promise.all([
            projectsApi.list(org.value.id, { isActive: true }),
            loadTimesheetForWeek(org.value.id, getWeekStartDateString(workDate.value)),
        ])
        projects.value = projectsResult
        timesheet.value = timesheetResult
        entries.value = timesheetResult
            ? await timesheetEntriesApi.list(org.value.id, timesheetResult.id)
            : []

        applyQueryPrefill()
        if (!selectedProjectId.value && activeProjects.value.length) {
            selectedProjectId.value = activeProjects.value[0].id
        }
    } catch (e) {
        console.error("Load tracker error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

function applyQueryPrefill() {
    if (running.value) return
    const rawDate = route.query.date
    const queryDate = typeof rawDate === "string" ? rawDate : ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
        workDate.value = queryDate
    }

    const rawProjectId = route.query.projectId
    const queryProjectId = typeof rawProjectId === "string" ? rawProjectId : ""
    if (queryProjectId && projects.value.some((project) => project.id === queryProjectId)) {
        selectedProjectId.value = queryProjectId
    }
}

async function loadTimesheetForWeek(organizationId: string, weekStart: string) {
    const existing = await timesheetsApi.listMine(organizationId, {
        fromWeekStart: weekStart,
        toWeekStart: weekStart,
    })
    if (existing?.length) return existing[0]
    return await timesheetsApi.create(organizationId, { weekStartDate: weekStart })
}

async function refreshEntries() {
    if (!organizationId.value || !timesheet.value?.id) return
    entries.value = await timesheetEntriesApi.list(organizationId.value, timesheet.value.id)
}

async function ensureTimesheetForSelectedWeek() {
    if (!organizationId.value) return
    try {
        const nextTimesheet = await loadTimesheetForWeek(
            organizationId.value,
            getWeekStartDateString(workDate.value)
        )
        if (!timesheet.value || nextTimesheet.id !== timesheet.value.id) {
            timesheet.value = nextTimesheet
            await refreshEntries()
        }
    } catch (e) {
        console.error("Load week timesheet error:", e)
        localError.value = toUiError(e)
    }
}

function startTimer() {
    void startTimerSession()
}

async function startTimerSession() {
    localError.value = null
    if (!isTimesheetEditable.value) {
        localError.value = {
            title: "Timesheet locked",
            message: "This week's timesheet cannot be edited in its current state.",
        }
        return
    }
    if (!canTrack.value) {
        localError.value = {
            title: "Select a project",
            message: "Pick a project before starting the timer.",
        }
        return
    }
    if (running.value) return
    if (!organizationId.value || !timesheet.value?.id) return

    saving.value = true
    try {
        const session = await trackerApi.start(organizationId.value, {
            timesheetId: timesheet.value.id,
            projectId: selectedProjectId.value,
            workDate: workDate.value,
            notes: notes.value.trim() || null,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
        })
        applyActiveSession(session)
    } catch (e) {
        if (isTrackerUnavailableError(e)) {
            startLocalSession()
            return
        }
        localError.value = toUiError(e)
    } finally {
        saving.value = false
    }
}

async function stopAndSave() {
    if (!running.value || !organizationId.value) return
    localError.value = null

    saving.value = true
    try {
        const createdEntry = activeSessionId.value
            ? await trackerApi.stop(organizationId.value, {
                notes: notes.value.trim() || null,
            })
            : await createEntryFromLocalSession()
        mergeCreatedEntry(createdEntry)
        clearActiveSession()
        await refreshEntries()
        notes.value = ""
        manualMinutes.value = null
    } catch (e) {
        console.error("Stop and save error:", e)
        localError.value = toUiError(e)
    } finally {
        saving.value = false
    }
}

async function addManualEntry() {
    localError.value = null
    if (!isTimesheetEditable.value) {
        localError.value = {
            title: "Timesheet locked",
            message: "This week's timesheet cannot be edited in its current state.",
        }
        return
    }
    if (!organizationId.value || !timesheet.value?.id) return
    if (!selectedProjectId.value) {
        localError.value = {
            title: "Select a project",
            message: "Pick a project before adding time.",
        }
        return
    }
    if (!manualMinutes.value || manualMinutes.value <= 0) {
        localError.value = {
            title: "Invalid duration",
            message: "Enter a duration greater than zero minutes.",
        }
        return
    }

    saving.value = true
    try {
        await timesheetEntriesApi.create(organizationId.value, timesheet.value.id, {
            projectId: selectedProjectId.value,
            workDate: workDate.value,
            durationMinutes: Number(manualMinutes.value),
            notes: notes.value.trim() || null,
            startTime: null,
            endTime: null,
        })
        await refreshEntries()
        notes.value = ""
        manualMinutes.value = null
    } catch (e) {
        console.error("Manual entry error:", e)
        localError.value = toUiError(e)
    } finally {
        saving.value = false
    }
}

async function deleteEntry(entry: TimesheetEntry) {
    if (!organizationId.value || !timesheet.value?.id) return
    deletingId.value = entry.id
    localError.value = null
    try {
        await timesheetEntriesApi.remove(organizationId.value, timesheet.value.id, entry.id)
        await refreshEntries()
    } catch (e) {
        console.error("Delete entry error:", e)
        localError.value = toUiError(e)
    } finally {
        deletingId.value = null
    }
}

function projectNameById(projectId: string) {
    return projects.value.find((project) => project.id === projectId)?.name ?? "Unknown project"
}

function projectClientById(projectId: string) {
    return (
        projects.value.find((project) => project.id === projectId)?.clientName ??
        org.value?.name ??
        "Internal"
    )
}

function projectAccent(projectId: string) {
    const palette = ["#3b82f6", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#0f766e"]
    const hash = Array.from(projectId).reduce((total, char) => total + char.charCodeAt(0), 0)
    return palette[hash % palette.length]
}

function mergeCreatedEntry(entry: TimesheetEntry) {
    if (timesheet.value?.id !== entry.timesheetId) return

    const next = entries.value
        .filter((existing) => existing.id !== entry.id)
        .concat(entry)
        .sort((a, b) => {
            if (a.workDate !== b.workDate) return a.workDate.localeCompare(b.workDate)
            return (a.startTime ?? "").localeCompare(b.startTime ?? "")
        })

    entries.value = next
}

function startTicker() {
    stopTicker()
    ticker = setInterval(() => {
        now.value = Date.now()
    }, 1000)
}

function stopTicker() {
    if (!ticker) return
    clearInterval(ticker)
    ticker = null
}

async function getActiveSession(orgId: string) {
    try {
        return await trackerApi.get(orgId)
    } catch (e: any) {
        if (isTrackerUnavailableError(e)) return null
        throw e
    }
}

function applyActiveSession(session: ActiveTimerSession) {
    activeSessionId.value = session.id
    selectedProjectId.value = session.projectId
    workDate.value = session.workDate
    notes.value = session.notes ?? ""
    running.value = true
    sessionStartedAt.value = parseUtcDateTime(session.startedAtUtc)
    now.value = Date.now()
    startTicker()
}

function clearActiveSession() {
    activeSessionId.value = null
    running.value = false
    sessionStartedAt.value = null
    stopTicker()
    clearNotesSyncTimer()
}

function startLocalSession() {
    activeSessionId.value = null
    running.value = true
    sessionStartedAt.value = new Date()
    now.value = Date.now()
    startTicker()
}

async function createEntryFromLocalSession() {
    if (!organizationId.value || !timesheet.value?.id || !sessionStartedAt.value) {
        throw new Error("Unable to save local timer session.")
    }

    const stopAt = new Date()
    const durationMinutes = Math.max(1, Math.round((stopAt.getTime() - sessionStartedAt.value.getTime()) / 60000))

    return await timesheetEntriesApi.create(organizationId.value, timesheet.value.id, {
        projectId: selectedProjectId.value,
        workDate: workDate.value,
        startTime: formatTimeForApi(sessionStartedAt.value),
        endTime: formatTimeForApi(stopAt),
        durationMinutes,
        notes: notes.value.trim() || null,
    })
}

function queueSessionNotesSync() {
    clearNotesSyncTimer()
    notesSyncTimer = setTimeout(() => {
        void syncSessionNotes()
    }, 400)
}

function clearNotesSyncTimer() {
    if (!notesSyncTimer) return
    clearTimeout(notesSyncTimer)
    notesSyncTimer = null
}

async function syncSessionNotes() {
    clearNotesSyncTimer()
    if (!running.value || !organizationId.value || !activeSessionId.value) return
    try {
        await trackerApi.update(organizationId.value, {
            notes: notes.value.trim() || null,
        })
    } catch (e) {
        console.error("Sync timer notes error:", e)
    }
}

function getWeekStartDateString(dateInput: string) {
    const current = new Date(dateInput)
    const day = current.getDay()
    const diff = (day + 6) % 7
    current.setDate(current.getDate() - diff)
    current.setHours(0, 0, 0, 0)
    return formatDateForInput(current)
}

function formatDateForInput(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function formatSecondsAsClock(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":")
}

function formatMinutes(total: number) {
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    if (!hours) return `${minutes}m`
    return `${hours}h ${minutes}m`
}

function formatDurationBadge(totalMinutes: number) {
    return formatSecondsAsClock(Math.max(0, totalMinutes) * 60)
}

function formatHoursValue(totalMinutes: number) {
    return `${Math.round((totalMinutes / 60) * 10) / 10}h`
}

function formatDateLong(value: string) {
    if (!value) return ""
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

function parseUtcDateTime(value: string) {
    const normalized = /z$|[+-]\d{2}:\d{2}$/i.test(value) ? value : `${value}Z`
    return new Date(normalized)
}

function formatTimeForApi(date: Date) {
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
}

function isTrackerUnavailableError(error: any) {
    const status = error?.status ?? error?.response?.status
    return status === 404 || status === 405 || status === 501
}
</script>

<template>
    <section class="track-page">
        <div class="track-page__header">
            <div>
                <p class="track-page__eyebrow">Track Time</p>
                <h1 class="track-page__title">Create a clearer view of today’s work.</h1>
                <p v-if="org" class="track-page__subtitle">{{ org.name }} · {{ selectedDateLabel }}</p>
            </div>
            <div class="track-page__badges">
                <span class="track-badge">{{ timesheetStatusLabel }}</span>
                <span class="track-badge">{{ todayEntries.length }} entries</span>
                <span class="track-badge track-badge--strong">{{ formatMinutes(todayTotalMinutes) }} today</span>
            </div>
        </div>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <section class="track-panel track-panel--loading">
                <p class="muted">Loading tracker...</p>
            </section>
        </template>

        <template v-else>
            <div v-if="!isTimesheetEditable" class="track-lock" role="status">
                <Icon name="mdi:lock-outline" size="18" />
                <span>Timesheet is {{ timesheetStatusLabel.toLowerCase() }}. Editing is disabled.</span>
            </div>

            <section class="track-hero">
                <div class="track-hero__content">
                    <div class="track-hero__status">
                        <span class="track-hero__dot"></span>
                        {{ heroStatusLabel }}
                    </div>

                    <h2 class="track-hero__title">{{ heroTitle }}</h2>

                    <div class="track-hero__meta">
                        <label class="track-project-pill">
                            <span class="sr-only">Project</span>
                            <select
                                v-model="selectedProjectId"
                                :disabled="running || !isTimesheetEditable"
                                class="track-project-pill__select"
                            >
                                <option value="">Select project</option>
                                <option v-for="project in activeProjects" :key="project.id" :value="project.id">
                                    {{ project.name }}
                                </option>
                            </select>
                            <Icon name="mdi:chevron-down" size="18" />
                        </label>

                        <span class="track-hero__meta-divider">•</span>
                        <p class="track-hero__meta-text">{{ selectedProjectClient }}</p>
                    </div>

                    <p class="track-hero__summary">{{ heroSubtitle }}</p>
                </div>

                <div class="track-hero__timer-panel">
                    <p class="track-hero__timer">{{ elapsedDisplay }}</p>
                    <div class="track-hero__actions">
                        <button
                            v-if="!running"
                            type="button"
                            class="btn track-btn track-btn--primary"
                            :disabled="saving || !isTimesheetEditable || !selectedProjectId || !hasProjects"
                            @click="startTimer"
                        >
                            <Icon name="mdi:play-circle" size="20" />
                            <span>{{ saving ? "Starting..." : "Start Timer" }}</span>
                        </button>
                        <button
                            v-else
                            type="button"
                            class="btn track-btn track-btn--primary"
                            :disabled="saving || !isTimesheetEditable"
                            @click="stopAndSave"
                        >
                            <Icon name="mdi:stop-circle-outline" size="20" />
                            <span>{{ saving ? "Saving..." : "Stop Timer" }}</span>
                        </button>

                        <button
                            type="button"
                            class="btn track-btn track-btn--secondary"
                            :disabled="
                                running ||
                                saving ||
                                !isTimesheetEditable ||
                                !hasProjects ||
                                !selectedProjectId ||
                                !manualMinutes ||
                                manualMinutes <= 0
                            "
                            @click="addManualEntry"
                        >
                            <Icon name="mdi:plus" size="20" />
                            <span>Add Entry</span>
                        </button>
                    </div>
                </div>
            </section>

            <section class="track-panel track-panel--controls">
                <div class="track-controls">
                    <label class="track-field">
                        <span class="track-field__label">Date</span>
                        <input v-model="workDate" type="date" :disabled="running" />
                    </label>

                    <label class="track-field">
                        <span class="track-field__label">Manual minutes</span>
                        <input
                            v-model.number="manualMinutes"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="60"
                            :disabled="running || !isTimesheetEditable"
                        />
                    </label>

                    <div class="track-field track-field--summary">
                        <span class="track-field__label">Today</span>
                        <strong>{{ formatMinutes(todayTotalMinutes) }}</strong>
                        <small>{{ averageEntryLabel }}</small>
                    </div>
                </div>

                <label class="track-field track-field--full">
                    <span class="track-field__label">Notes</span>
                    <textarea
                        v-model.trim="notes"
                        rows="3"
                        placeholder="Add task details, outcomes, or context for this entry."
                        :disabled="!isTimesheetEditable"
                    />
                </label>

                <p v-if="!hasProjects" class="muted">No active projects available.</p>
            </section>

            <div v-if="localError" class="alert alert--inline" role="alert">
                <div class="alert__title">{{ localError.title }}</div>
                <div class="alert__msg">{{ localError.message }}</div>
            </div>

            <section class="track-panel track-log">
                <div class="track-log__header">
                    <div>
                        <h2 class="track-log__title">Today’s Log</h2>
                        <p class="track-log__subtitle">{{ selectedDateLabel }}</p>
                    </div>
                    <div class="track-log__summary">
                        <span>Total for today</span>
                        <strong>{{ formatDurationBadge(todayTotalMinutes) }}</strong>
                    </div>
                </div>

                <div v-if="todayEntries.length" class="track-log__table">
                    <div class="track-log__head track-log__row">
                        <span>Project</span>
                        <span>Task</span>
                        <span>Duration</span>
                        <span>Actions</span>
                    </div>

                    <article v-for="entry in todayEntries" :key="entry.id" class="track-log__row track-entry">
                        <div class="track-entry__project" data-label="Project">
                            <span class="track-entry__dot" :style="{ backgroundColor: projectAccent(entry.projectId) }"></span>
                            <div>
                                <strong>{{ projectNameById(entry.projectId) }}</strong>
                                <p>{{ projectClientById(entry.projectId) }}</p>
                            </div>
                        </div>

                        <div class="track-entry__task" data-label="Task">
                            <strong>{{ entry.notes || "Focused work session" }}</strong>
                            <p>
                                {{
                                    entry.startTime && entry.endTime
                                        ? `${entry.startTime} - ${entry.endTime}`
                                        : "Manual time entry"
                                }}
                            </p>
                        </div>

                        <div class="track-entry__duration" data-label="Duration">
                            {{ formatDurationBadge(entry.durationMinutes ?? 0) }}
                        </div>

                        <div class="track-entry__actions" data-label="Actions">
                            <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                :disabled="deletingId === entry.id || !isTimesheetEditable"
                                @click="deleteEntry(entry)"
                            >
                                {{ deletingId === entry.id ? "Removing..." : "Delete" }}
                            </button>
                        </div>
                    </article>
                </div>

                <p v-else class="muted">No entries for this day yet.</p>
            </section>

            <section class="track-stats">
                <article class="track-stat-card">
                    <div class="track-stat-card__header">
                        <span>Weekly Goal</span>
                        <Icon name="mdi:flag-variant-outline" size="22" />
                    </div>
                    <strong class="track-stat-card__value">{{ weeklyGoalLabel }}</strong>
                    <div class="track-progress">
                        <span class="track-progress__bar" :style="{ width: `${weeklyGoalProgress}%` }"></span>
                    </div>
                    <p>{{ weeklyGoalProgress }}% of 40h target</p>
                </article>

                <article class="track-stat-card">
                    <div class="track-stat-card__header">
                        <span>Tracked This Week</span>
                        <Icon name="mdi:cash-multiple" size="22" />
                    </div>
                    <strong class="track-stat-card__value">{{ formatDurationBadge(weekTotalMinutes) }}</strong>
                    <p>{{ activeProjects.length }} active projects available to log against.</p>
                </article>

                <article class="track-stat-card track-stat-card--accent">
                    <div class="track-stat-card__header">
                        <span>Focus Score</span>
                        <Icon name="mdi:lightning-bolt" size="22" />
                    </div>
                    <strong class="track-stat-card__value">{{ focusScore }}%</strong>
                    <p>{{ focusDeltaLabel }}</p>
                </article>
            </section>
        </template>
    </section>
</template>

<style scoped>
.track-page {
    display: grid;
    gap: var(--s-4);
}

.track-page__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.track-page__eyebrow {
    margin: 0 0 var(--s-1);
    color: var(--text-3);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.track-page__title {
    margin: 0;
    font-size: clamp(1.4rem, 3vw, 2rem);
    line-height: 1.1;
}

.track-page__subtitle {
    margin: var(--s-1) 0 0;
    color: var(--text-2);
    font-size: 0.9rem;
}

.track-page__badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
}

.track-badge {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-2);
    font-size: 0.875rem;
    font-weight: 700;
    box-shadow: var(--shadow-sm);
}

.track-badge--strong {
    color: var(--primary);
}

.track-panel,
.track-hero,
.track-stat-card {
    border-radius: var(--r-lg);
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
}

.track-panel {
    padding: var(--s-4);
}

.track-panel--loading {
    display: grid;
    place-items: center;
    min-height: 220px;
}

.track-lock {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 16px;
    background: #fff7ed;
    border: 1px solid rgba(217, 119, 6, 0.18);
    color: #9a3412;
    font-weight: 600;
}

.track-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.9fr);
    gap: var(--s-4);
    padding: var(--s-5);
}

.track-hero__content {
    display: grid;
    align-content: start;
    gap: var(--s-3);
}

.track-hero__status {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--text-3);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.track-hero__dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, #7dd3fc 0%, #5eead4 100%);
}

.track-hero__title {
    margin: 0;
    font-size: clamp(1.2rem, 2.2vw, 1.85rem);
    line-height: 1.1;
}

.track-hero__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--s-3);
    color: var(--text-2);
}

.track-project-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 12px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
}

.track-project-pill__select {
    border: 0;
    padding: 0;
    background: transparent;
    box-shadow: none;
    color: var(--text-1);
    font-weight: 600;
    min-width: 160px;
}

.track-project-pill__select:focus {
    box-shadow: none;
}

.track-hero__meta-divider {
    font-size: 1.4rem;
    line-height: 1;
    color: #94a3b8;
}

.track-hero__meta-text,
.track-hero__summary {
    margin: 0;
    color: var(--text-2);
    font-size: 0.9rem;
}

.track-hero__timer-panel {
    display: grid;
    align-content: center;
    justify-items: end;
    gap: var(--s-4);
}

.track-hero__timer {
    margin: 0;
    font-size: clamp(2rem, 4.2vw, 3.25rem);
    line-height: 1;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text-1);
    font-variant-numeric: tabular-nums;
}

.track-hero__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 14px;
}

.track-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    padding: 0 14px;
    border-radius: var(--r-sm);
    font-size: 0.95rem;
    font-weight: 700;
    box-shadow: none;
}

.track-btn--primary {
    background: var(--primary);
}

.track-btn--primary:hover {
    background: var(--primary-hover);
}

.track-btn--secondary {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text-1);
    box-shadow: none;
}

.track-btn--secondary:hover {
    background: var(--surface-2);
}

.track-controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
    margin-bottom: var(--s-3);
}

.track-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.track-field__label {
    color: var(--text-2);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.track-field--summary {
    justify-content: center;
    padding: var(--s-3);
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
}

.track-field--summary strong {
    font-size: clamp(1.2rem, 2.2vw, 1.85rem);
    line-height: 1;
}

.track-field--summary small {
    color: var(--text-2);
    font-size: 0.92rem;
}

.track-field--full textarea {
    resize: vertical;
    min-height: 104px;
}

.track-log {
    display: grid;
    gap: var(--s-3);
}

.track-log__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.track-log__title {
    margin: 0;
    font-size: 1rem;
}

.track-log__subtitle {
    margin: var(--s-1) 0 0;
    color: var(--text-2);
    font-size: 0.875rem;
}

.track-log__summary {
    display: grid;
    gap: 6px;
    justify-items: end;
    color: var(--text-2);
    font-weight: 600;
}

.track-log__summary strong {
    color: var(--primary);
    font-size: clamp(1.2rem, 2.2vw, 1.85rem);
    font-variant-numeric: tabular-nums;
}

.track-log__table {
    border-radius: var(--r-sm);
    overflow: hidden;
    border: 1px solid var(--border);
}

.track-log__row {
    display: grid;
    grid-template-columns: minmax(180px, 1.1fr) minmax(220px, 1.8fr) 160px 120px;
    gap: var(--s-3);
    align-items: center;
    padding: var(--s-3) var(--s-4);
    background: var(--surface);
}

.track-log__head {
    background: var(--surface-2);
    color: var(--text-2);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.track-entry + .track-entry {
    border-top: 1px solid var(--border);
}

.track-entry__project,
.track-entry__task,
.track-entry__actions {
    display: flex;
    align-items: center;
    gap: 14px;
}

.track-entry__project strong,
.track-entry__task strong {
    display: block;
    font-size: 0.95rem;
}

.track-entry__project p,
.track-entry__task p {
    margin: 6px 0 0;
    color: var(--text-2);
}

.track-entry__dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex-shrink: 0;
}

.track-entry__duration {
    justify-self: start;
    padding: 6px 10px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--text-1);
    font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.track-entry__actions {
    justify-content: flex-end;
}

.track-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
}

.track-stat-card {
    padding: var(--s-4);
    display: grid;
    gap: var(--s-3);
}

.track-stat-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text-2);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.track-stat-card__value {
    font-size: clamp(1.2rem, 2.2vw, 1.85rem);
    line-height: 1;
    letter-spacing: -0.01em;
}

.track-stat-card p {
    margin: 0;
    color: var(--text-2);
    font-size: 0.9rem;
}

.track-progress {
    position: relative;
    overflow: hidden;
    height: 10px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
}

.track-progress__bar {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: var(--primary);
}

.track-stat-card--accent {
    border-left: 4px solid var(--accent);
}

.track-stat-card--accent .track-stat-card__header,
.track-stat-card--accent p {
    color: var(--text-2);
}

.btn-sm {
    padding: 8px 12px;
    font-size: 0.9rem;
}

.alert--inline {
    margin-top: -6px;
}

.muted {
    margin: 0;
    color: var(--text-2);
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

@media (max-width: 1180px) {
    .track-hero {
        grid-template-columns: 1fr;
    }

    .track-hero__timer-panel,
    .track-hero__actions {
        justify-items: start;
        justify-content: flex-start;
    }

    .track-stats {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 860px) {
    .track-page__header,
    .track-log__header {
        flex-direction: column;
        align-items: flex-start;
    }

    .track-page__badges,
    .track-log__summary {
        justify-content: flex-start;
        justify-items: start;
    }

    .track-controls {
        grid-template-columns: 1fr;
    }

    .track-log__table {
        border: 0;
        overflow: visible;
    }

    .track-log__head {
        display: none;
    }

    .track-entry {
        grid-template-columns: 1fr;
        gap: 12px;
        margin-bottom: 14px;
        border: 1px solid var(--border);
        border-radius: var(--r-sm);
        box-shadow: var(--shadow-sm);
    }

    .track-entry + .track-entry {
        border-top: 1px solid var(--border);
    }

    .track-entry__project,
    .track-entry__task,
    .track-entry__actions {
        align-items: flex-start;
    }

    .track-entry__duration,
    .track-entry__actions {
        justify-self: start;
    }
}

@media (max-width: 640px) {
    .track-page {
        gap: var(--s-3);
    }

    .track-panel,
    .track-stat-card,
    .track-hero {
        padding: var(--s-4);
        border-radius: var(--r-lg);
    }

    .track-hero__meta {
        gap: 10px;
    }

    .track-project-pill {
        width: 100%;
        justify-content: space-between;
    }

    .track-project-pill__select {
        width: 100%;
        min-width: 0;
    }

    .track-btn {
        width: 100%;
        justify-content: center;
    }

    .track-hero__actions {
        width: 100%;
    }

    .track-log__row {
        padding: var(--s-3);
    }
}
</style>
