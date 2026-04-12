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

type TrackerViewState = "idle" | "running" | "stopped_unsaved"

const route = useRoute()

const org = ref<Organization | null>(null)
const projects = ref<Project[]>([])
const timesheet = ref<Timesheet | null>(null)
const entries = ref<TimesheetEntry[]>([])

const loading = ref(true)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const error = ref<UiError | null>(null)
const localError = ref<UiError | null>(null)

const todayKey = ref(formatDateForInput(new Date()))
const selectedProjectId = ref("")
const notes = ref("")

const running = ref(false)
const sessionStartedAt = ref<Date | null>(null)
const activeSessionId = ref<string | null>(null)
const activeSessionWorkDate = ref(todayKey.value)
const now = ref(Date.now())
const pendingStoppedEntry = ref<TimesheetEntry | null>(null)
const stoppedElapsedSeconds = ref(0)

let ticker: ReturnType<typeof setInterval> | null = null
let notesSyncTimer: ReturnType<typeof setTimeout> | null = null

const organizationId = computed(() => org.value?.id ?? "")
const activeProjects = computed(() =>
    projects.value
        .filter((project) => project.isActive !== false)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
)
const hasProjects = computed(() => activeProjects.value.length > 0)
const todayEntries = computed(() =>
    entries.value
        .filter((entry) => entry.workDate === todayKey.value)
        .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
)
const todayTotalMinutes = computed(() =>
    todayEntries.value.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0)
)
const trackerState = computed<TrackerViewState>(() => {
    if (running.value) return "running"
    if (pendingStoppedEntry.value) return "stopped_unsaved"
    return "idle"
})
const isTimesheetEditable = computed(() => {
    const status = timesheet.value?.status
    return status === undefined || status === 0 || status === 3
})
const elapsedSeconds = computed(() => {
    if (!running.value || !sessionStartedAt.value) return 0
    return Math.max(0, Math.floor((now.value - sessionStartedAt.value.getTime()) / 1000))
})
const timerDisplay = computed(() => {
    if (trackerState.value === "running") return formatSecondsAsClock(elapsedSeconds.value)
    if (trackerState.value === "stopped_unsaved") return formatSecondsAsClock(stoppedElapsedSeconds.value)
    return "00:00:00"
})
const headerDateLabel = computed(() => `Today · ${formatDateLong(todayKey.value)}`)
const trackingContextLabel = computed(() =>
    activeSessionWorkDate.value === todayKey.value
        ? "Tracking for today"
        : `Tracking for ${formatDateLong(activeSessionWorkDate.value)}`
)
const todaySummaryLabel = computed(() => {
    const count = todayEntries.value.length
    const entryLabel = `${count} ${count === 1 ? "entry" : "entries"} today`
    return `${entryLabel} · ${formatMinutes(todayTotalMinutes.value)} tracked`
})
const canStartTimer = computed(
    () =>
        trackerState.value === "idle" &&
        !!selectedProjectId.value &&
        !!timesheet.value?.id &&
        hasProjects.value &&
        isTimesheetEditable.value
)
const isProjectLocked = computed(
    () => trackerState.value !== "idle" || saving.value || !isTimesheetEditable.value
)
const isNotesDisabled = computed(() => saving.value || !isTimesheetEditable.value)

onMounted(() => loadTrackerData())
onBeforeUnmount(() => {
    stopTicker()
    clearNotesSyncTimer()
})

watch(
    () => route.query.projectId,
    () => {
        applyQueryPrefill()
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
        if (!firstOrg?.id) return

        org.value = firstOrg

        const activeSession = await getActiveSession(firstOrg.id)
        if (activeSession) {
            applyActiveSession(activeSession)
        }

        const [projectsResult, timesheetResult] = await Promise.all([
            projectsApi.list(firstOrg.id, { isActive: true }),
            loadTimesheetForWeek(firstOrg.id, getWeekStartDateString(todayKey.value)),
        ])

        projects.value = projectsResult
        timesheet.value = timesheetResult
        entries.value = timesheetResult
            ? await timesheetEntriesApi.list(firstOrg.id, timesheetResult.id)
            : []

        applyQueryPrefill()
    } catch (e) {
        console.error("Load tracker error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

function applyQueryPrefill() {
    if (trackerState.value !== "idle") return

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

    if (!canStartTimer.value) {
        localError.value = {
            title: "Select a project",
            message: "Pick a project before starting the timer.",
        }
        return
    }

    if (!organizationId.value || !timesheet.value?.id) return

    saving.value = true
    try {
        const session = await trackerApi.start(organizationId.value, {
            timesheetId: timesheet.value.id,
            projectId: selectedProjectId.value,
            workDate: todayKey.value,
            notes: notes.value.trim() || null,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
        })
        applyActiveSession(session)
    } catch (e) {
        localError.value = toUiError(e)
    } finally {
        saving.value = false
    }
}

function stopTimer() {
    void stopTimerSession()
}

async function stopTimerSession() {
    if (!running.value || !organizationId.value) return

    localError.value = null
    saving.value = true

    try {
        const createdEntry = await trackerApi.stop(organizationId.value, {
            notes: notes.value.trim() || null,
        })

        stoppedElapsedSeconds.value = elapsedSeconds.value
        pendingStoppedEntry.value = createdEntry
        clearActiveSession()
    } catch (e) {
        console.error("Stop timer error:", e)
        localError.value = toUiError(e)
    } finally {
        saving.value = false
    }
}

function saveEntry() {
    void saveStoppedEntry()
}

async function saveStoppedEntry() {
    if (!pendingStoppedEntry.value) return

    localError.value = null
    saving.value = true

    try {
        mergeCreatedEntry(pendingStoppedEntry.value)
        await refreshEntries()
        resetComposer()
    } catch (e) {
        console.error("Save entry error:", e)
        localError.value = toUiError(e)
    } finally {
        saving.value = false
    }
}

function discardEntry() {
    void discardStoppedEntry()
}

async function discardStoppedEntry() {
    if (!pendingStoppedEntry.value || !organizationId.value) return

    localError.value = null
    saving.value = true

    try {
        const timesheetId = pendingStoppedEntry.value.timesheetId ?? timesheet.value?.id
        if (!timesheetId) return

        await timesheetEntriesApi.remove(organizationId.value, timesheetId, pendingStoppedEntry.value.id)
        await refreshEntries()
        resetComposer()
    } catch (e) {
        console.error("Discard entry error:", e)
        localError.value = toUiError(e)
    } finally {
        saving.value = false
    }
}

async function deleteEntry(entry: TimesheetEntry) {
    if (!organizationId.value) return

    if (!isTimesheetEditable.value) {
        localError.value = {
            title: "Timesheet locked",
            message: "This week's timesheet cannot be edited in its current state.",
        }
        return
    }

    const timesheetId = entry.timesheetId ?? timesheet.value?.id
    if (!timesheetId) return

    deletingId.value = entry.id
    localError.value = null

    try {
        await timesheetEntriesApi.remove(organizationId.value, timesheetId, entry.id)
        await refreshEntries()
    } catch (e) {
        console.error("Delete entry error:", e)
        localError.value = toUiError(e)
    } finally {
        deletingId.value = null
    }
}

function mergeCreatedEntry(entry: TimesheetEntry) {
    const next = entries.value
        .filter((existing) => existing.id !== entry.id)
        .concat(entry)
        .sort((a, b) => {
            if (a.workDate !== b.workDate) return a.workDate.localeCompare(b.workDate)
            return (a.startTime ?? "").localeCompare(b.startTime ?? "")
        })

    entries.value = next
}

function applyActiveSession(session: ActiveTimerSession) {
    activeSessionId.value = session.id
    activeSessionWorkDate.value = session.workDate || todayKey.value
    selectedProjectId.value = session.projectId
    notes.value = session.notes ?? ""
    pendingStoppedEntry.value = null
    stoppedElapsedSeconds.value = 0
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

function resetComposer() {
    pendingStoppedEntry.value = null
    stoppedElapsedSeconds.value = 0
    notes.value = ""
    activeSessionWorkDate.value = todayKey.value
    clearActiveSession()
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
        if (e?.status === 404 || e?.response?.status === 404) return null
        throw e
    }
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

function projectNameById(projectId: string) {
    return projects.value.find((project) => project.id === projectId)?.name ?? "Unknown project"
}

function getWeekStartDateString(dateInput: string) {
    const current = new Date(`${dateInput}T00:00:00`)
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
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
}

function formatMinutes(total: number) {
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    if (!hours) return `${minutes}m`
    if (!minutes) return `${hours}h`
    return `${hours}h ${minutes}m`
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

function formatTimeValue(value?: string | null) {
    if (!value) return ""

    const normalized = value.length === 5 ? `${value}:00` : value
    const date = new Date(`${todayKey.value}T${normalized}`)
    if (Number.isNaN(date.getTime())) return value.slice(0, 5)

    return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    })
}

function formatTimeRange(entry: TimesheetEntry) {
    const start = formatTimeValue(entry.startTime)
    const end = formatTimeValue(entry.endTime)
    if (start && end) return `${start} - ${end}`
    if (start) return start
    return "Time range unavailable"
}

function parseUtcDateTime(value: string) {
    const normalized = /z$|[+-]\d{2}:\d{2}$/i.test(value) ? value : `${value}Z`
    return new Date(normalized)
}
</script>

<template>
    <section class="track-page">
        <header class="track-page__header">
            <div>
                <p v-if="org" class="track-page__workspace">{{ org.name }}</p>
                <h1 class="track-page__title">Track time</h1>
                <p class="track-page__date">{{ headerDateLabel }}</p>
            </div>
            <p v-if="!loading && !error" class="track-page__summary">{{ todaySummaryLabel }}</p>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <section class="card track-card track-card--loading">
                <p class="muted">Loading tracker...</p>
            </section>
        </template>

        <template v-else>
            <div v-if="!isTimesheetEditable" class="track-page__notice" role="status">
                This week's timesheet is locked. You can review entries, but you cannot start a new timer.
            </div>

            <section class="card track-card" :class="`track-card--${trackerState}`">
                <div class="track-card__topline">
                    <p class="track-card__context">{{ trackingContextLabel }}</p>
                    <div class="track-card__state" :class="`track-card__state--${trackerState}`">
                        <span class="track-card__state-dot" />
                        <span v-if="trackerState === 'running'">Tracking...</span>
                        <span v-else-if="trackerState === 'stopped_unsaved'">Ready to save</span>
                        <span v-else>Ready to track</span>
                    </div>
                </div>

                <p class="track-card__timer">{{ timerDisplay }}</p>

                <div class="track-card__fields">
                    <label class="track-field">
                        <span>Select project</span>
                        <select v-model="selectedProjectId" :disabled="isProjectLocked">
                            <option value="">Select project</option>
                            <option v-for="project in activeProjects" :key="project.id" :value="project.id">
                                {{ project.name }}
                            </option>
                        </select>
                    </label>

                    <label class="track-field track-field--notes">
                        <span>Notes</span>
                        <textarea
                            v-model.trim="notes"
                            rows="3"
                            placeholder="What are you working on?"
                            :disabled="isNotesDisabled"
                        />
                    </label>
                </div>

                <div class="track-card__actions">
                    <button
                        v-if="trackerState === 'idle'"
                        type="button"
                        class="btn btn-primary track-card__primary"
                        :disabled="!canStartTimer || saving"
                        @click="startTimer"
                    >
                        {{ saving ? "Starting..." : "Start timer" }}
                    </button>

                    <button
                        v-else-if="trackerState === 'running'"
                        type="button"
                        class="btn btn-primary track-card__primary"
                        :disabled="saving"
                        @click="stopTimer"
                    >
                        {{ saving ? "Stopping..." : "Stop timer" }}
                    </button>

                    <template v-else>
                        <button
                            type="button"
                            class="btn btn-primary track-card__primary"
                            :disabled="saving"
                            @click="saveEntry"
                        >
                            {{ saving ? "Saving..." : "Save entry" }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-secondary"
                            :disabled="saving"
                            @click="discardEntry"
                        >
                            Discard
                        </button>
                    </template>
                </div>

                <p v-if="!hasProjects" class="muted">No active projects available.</p>
            </section>

            <div v-if="localError" class="alert alert--inline" role="alert">
                <div class="alert__title">{{ localError.title }}</div>
                <div class="alert__msg">{{ localError.message }}</div>
            </div>

            <section class="card track-log">
                <div class="track-log__header">
                    <div>
                        <h2 class="track-log__title">Today's entries</h2>
                        <p class="track-log__subtitle">Saved entries only</p>
                    </div>
                    <p class="track-log__total">{{ formatMinutes(todayTotalMinutes) }} tracked</p>
                </div>

                <table v-if="todayEntries.length" class="track-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Start-End</th>
                            <th>Duration</th>
                            <th>Notes</th>
                            <th class="track-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in todayEntries" :key="entry.id">
                            <td data-label="Project">{{ projectNameById(entry.projectId) }}</td>
                            <td data-label="Start-End">{{ formatTimeRange(entry) }}</td>
                            <td data-label="Duration">{{ formatMinutes(entry.durationMinutes ?? 0) }}</td>
                            <td data-label="Notes">{{ entry.notes || "No notes" }}</td>
                            <td class="track-table__actions" data-label="Actions">
                                <button
                                    type="button"
                                    class="btn btn-secondary btn-sm"
                                    :disabled="deletingId === entry.id || !isTimesheetEditable"
                                    @click="deleteEntry(entry)"
                                >
                                    {{ deletingId === entry.id ? "Removing..." : "Delete" }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <p v-else class="muted">No saved entries for today yet.</p>
            </section>
        </template>
    </section>
</template>

<style scoped>
.track-page {
    display: grid;
    gap: var(--s-5);
}

.track-page__header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-4);
}

.track-page__workspace {
    margin: 0 0 var(--s-2);
    color: var(--primary);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.track-page__title {
    margin: 0;
    font-size: clamp(2rem, 4vw, 2.75rem);
    line-height: 1;
}

.track-page__date {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
    font-size: 1rem;
    font-weight: 600;
}

.track-page__summary {
    margin: 0;
    color: var(--text-2);
    font-weight: 600;
    white-space: nowrap;
}

.track-page__notice {
    border: 1px solid color-mix(in srgb, var(--warning) 28%, var(--border));
    border-radius: var(--r-md);
    background: linear-gradient(135deg, var(--warning-soft), var(--surface));
    padding: var(--s-3) var(--s-4);
    color: #8a4b08;
    font-size: 0.9375rem;
}

.track-card,
.track-log {
    border-radius: 24px;
    padding: var(--s-5);
    box-shadow: var(--shadow-md);
}

.track-card {
    position: relative;
    overflow: hidden;
    background:
        radial-gradient(circle at top right, rgba(15, 118, 110, 0.14), transparent 32%),
        linear-gradient(180deg, #ffffff 0%, #f7fbfb 100%);
}

.track-card::after {
    content: "";
    position: absolute;
    inset: auto -40px -60px auto;
    width: 180px;
    height: 180px;
    border-radius: 999px;
    background: rgba(244, 182, 122, 0.16);
    filter: blur(6px);
    pointer-events: none;
}

.track-card--running {
    border-color: rgba(15, 118, 110, 0.35);
}

.track-card--running .track-card__timer {
    color: var(--primary);
}

.track-card--stopped_unsaved {
    border-color: rgba(37, 99, 235, 0.28);
    background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 28%),
        linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.track-card--loading {
    min-height: 220px;
    display: grid;
    place-items: center;
}

.track-card__topline {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
}

.track-card__context {
    margin: 0;
    color: var(--text-2);
    font-size: 0.95rem;
    font-weight: 600;
}

.track-card__state {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 0.875rem;
    font-weight: 700;
}

.track-card__state--idle {
    background: var(--surface-2);
    color: var(--text-2);
}

.track-card__state--running {
    background: var(--primary-soft);
    color: var(--primary);
}

.track-card__state--stopped_unsaved {
    background: var(--info-soft);
    color: var(--info);
}

.track-card__state-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.8;
}

.track-card__state--running .track-card__state-dot {
    animation: track-pulse 1.4s ease-in-out infinite;
}

.track-card__timer {
    position: relative;
    z-index: 1;
    margin: 0 0 var(--s-5);
    font-size: clamp(3rem, 9vw, 5.5rem);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.04em;
    line-height: 0.95;
}

.track-card__fields {
    display: grid;
    grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
    gap: var(--s-4);
    align-items: start;
}

.track-field {
    display: grid;
    gap: var(--s-2);
}

.track-field span {
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text-2);
    letter-spacing: 0.02em;
}

.track-field textarea {
    resize: vertical;
    min-height: 92px;
}

.track-card__actions {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
    margin-top: var(--s-5);
}

.track-card__primary {
    min-width: 180px;
}

.track-log {
    background: var(--surface);
}

.track-log__header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
}

.track-log__title {
    margin: 0;
    font-size: 1.25rem;
}

.track-log__subtitle {
    margin: var(--s-1) 0 0;
    color: var(--text-2);
}

.track-log__total {
    margin: 0;
    color: var(--text-2);
    font-weight: 700;
}

.track-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}

.track-table th,
.track-table td {
    padding: var(--s-3);
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
}

.track-table th {
    color: var(--text-3);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.track-table td {
    word-break: break-word;
}

.track-table__actions {
    width: 108px;
}

.btn-sm {
    padding: 7px 10px;
    font-size: 0.875rem;
}

.alert--inline {
    margin-top: calc(var(--s-5) * -0.5);
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@keyframes track-pulse {
    0%,
    100% {
        transform: scale(1);
        opacity: 0.65;
    }
    50% {
        transform: scale(1.45);
        opacity: 1;
    }
}

@media (max-width: 980px) {
    .track-page__header,
    .track-log__header,
    .track-card__topline {
        align-items: start;
        flex-direction: column;
    }

    .track-card__fields {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 760px) {
    .track-card,
    .track-log {
        padding: var(--s-4);
        border-radius: 20px;
    }

    .track-page__summary {
        white-space: normal;
    }

    .track-card__timer {
        margin-bottom: var(--s-4);
        font-size: clamp(2.5rem, 14vw, 4rem);
    }

    .track-card__actions {
        flex-direction: column;
    }

    .track-card__primary,
    .track-card__actions .btn {
        width: 100%;
    }

    .track-table,
    .track-table thead,
    .track-table tbody,
    .track-table tr,
    .track-table th,
    .track-table td {
        display: block;
    }

    .track-table thead {
        display: none;
    }

    .track-table tbody {
        display: grid;
        gap: var(--s-2);
    }

    .track-table tr {
        border: 1px solid var(--border);
        border-radius: var(--r-md);
        padding: var(--s-3);
        background: linear-gradient(180deg, var(--surface) 0%, #fbfcff 100%);
    }

    .track-table td {
        border: 0;
        padding: var(--s-1) 0;
    }

    .track-table td::before {
        content: attr(data-label);
        display: block;
        margin-bottom: 2px;
        color: var(--text-3);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .track-table__actions {
        width: auto;
    }
}
</style>
