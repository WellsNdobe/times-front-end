<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
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
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

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

onMounted(() => loadTrackerData())
onBeforeUnmount(stopTicker)

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
    running.value = true
    sessionStartedAt.value = new Date()
    startTicker()
}

async function stopAndSave() {
    if (!running.value || !sessionStartedAt.value) return
    if (!organizationId.value || !timesheet.value?.id || !selectedProjectId.value) return
    localError.value = null

    const started = sessionStartedAt.value
    const ended = new Date()
    const durationMinutes = Math.max(
        1,
        Math.round((ended.getTime() - started.getTime()) / 60000)
    )

    saving.value = true
    try {
        await timesheetEntriesApi.create(organizationId.value, timesheet.value.id, {
            projectId: selectedProjectId.value,
            workDate: workDate.value,
            startTime: toTimeString(started),
            endTime: toTimeString(ended),
            durationMinutes,
            notes: notes.value.trim() || null,
        })
        await refreshEntries()
        notes.value = ""
        manualMinutes.value = null
    } catch (e) {
        console.error("Stop and save error:", e)
        localError.value = toUiError(e)
    } finally {
        running.value = false
        sessionStartedAt.value = null
        saving.value = false
        stopTicker()
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

function toTimeString(date: Date) {
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
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
</script>

<template>
    <section class="card track">
        <header class="track__header">
            <div>
                <h1 class="track__title">Track time</h1>
                <p v-if="org" class="track__subtitle">{{ org.name }}</p>
            </div>
            <p class="track__date">{{ selectedDateLabel }}</p>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <p class="muted">Loading tracker...</p>
        </template>

        <template v-else>
            <div class="track__chips">
                <span class="track-chip">Status: {{ timesheetStatusLabel }}</span>
                <span class="track-chip">{{ formatMinutes(todayTotalMinutes) }} today</span>
                <span class="track-chip">{{ todayEntries.length }} entries</span>
            </div>

            <div v-if="!isTimesheetEditable" class="track__notice" role="status">
                Timesheet is {{ timesheetStatusLabel.toLowerCase() }}. Editing is disabled.
            </div>

            <section class="track__composer">
                <p class="track__timer">{{ elapsedDisplay }}</p>

                <div class="track__grid">
                    <label class="track__field">
                        <span>Project</span>
                        <select v-model="selectedProjectId" :disabled="running || !isTimesheetEditable">
                            <option value="">Select project</option>
                            <option
                                v-for="project in activeProjects"
                                :key="project.id"
                                :value="project.id"
                            >
                                {{ project.name }}
                            </option>
                        </select>
                    </label>

                    <label class="track__field">
                        <span>Date</span>
                        <input v-model="workDate" type="date" :disabled="running" />
                    </label>

                    <label class="track__field">
                        <span>Minutes</span>
                        <input
                            v-model.number="manualMinutes"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="60"
                            :disabled="running || !isTimesheetEditable"
                        />
                    </label>

                    <label class="track__field track__field--full">
                        <span>Notes</span>
                        <input
                            v-model.trim="notes"
                            type="text"
                            placeholder="Optional"
                            :disabled="!isTimesheetEditable"
                        />
                    </label>
                </div>

                <div class="track__actions">
                    <button
                        type="button"
                        class="btn btn-primary"
                        :disabled="
                            running ||
                            saving ||
                            !isTimesheetEditable ||
                            !selectedProjectId ||
                            !hasProjects
                        "
                        @click="startTimer"
                    >
                        Start timer
                    </button>
                    <button
                        type="button"
                        class="btn btn-secondary"
                        :disabled="!running || saving || !isTimesheetEditable"
                        @click="stopAndSave"
                    >
                        {{ saving ? "Saving..." : "Stop and save" }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-secondary"
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
                        Add minutes
                    </button>
                </div>

                <p v-if="!hasProjects" class="muted">No active projects available.</p>
            </section>

            <div v-if="localError" class="alert alert--inline" role="alert">
                <div class="alert__title">{{ localError.title }}</div>
                <div class="alert__msg">{{ localError.message }}</div>
            </div>

            <section class="track__entries">
                <div class="track__entries-head">
                    <h2 class="track__entries-title">Log</h2>
                    <p class="track__entries-total">{{ formatMinutes(todayTotalMinutes) }} today</p>
                </div>

                <table v-if="todayEntries.length" class="track-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Time</th>
                            <th>Duration</th>
                            <th>Notes</th>
                            <th class="track-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in todayEntries" :key="entry.id">
                            <td data-label="Project">{{ projectNameById(entry.projectId) }}</td>
                            <td data-label="Time">
                                {{
                                    entry.startTime && entry.endTime
                                        ? `${entry.startTime} - ${entry.endTime}`
                                        : "Manual"
                                }}
                            </td>
                            <td data-label="Duration">{{ formatMinutes(entry.durationMinutes ?? 0) }}</td>
                            <td data-label="Notes">{{ entry.notes || "N/A" }}</td>
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
                <p v-else class="muted">No entries for this day yet.</p>
            </section>
        </template>
    </section>
</template>

<style scoped>
.track {
    padding: var(--s-5);
}

.track__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-4);
    margin-bottom: var(--s-3);
}

.track__title {
    margin: 0 0 var(--s-1) 0;
    font-size: 1.5rem;
}

.track__subtitle {
    margin: 0;
    color: var(--text-2);
}

.track__date {
    margin: 0;
    color: var(--text-2);
    font-size: 0.875rem;
    font-weight: 600;
}

.track__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
}

.track-chip {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 var(--s-2);
    background: var(--surface-2);
    font-size: 0.875rem;
}

.track__timer {
    margin: 0 0 var(--s-3) 0;
    font-size: 2.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
}

.track__notice {
    margin-bottom: var(--s-3);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface-2);
    padding: var(--s-2) var(--s-3);
    color: var(--text-2);
    font-size: 0.875rem;
}

.track__composer {
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: linear-gradient(165deg, var(--surface-2) 0%, var(--surface) 100%);
    padding: var(--s-3);
    margin-bottom: var(--s-3);
}

.track__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(160px, 1fr));
    gap: var(--s-3);
    margin-bottom: var(--s-3);
}

.track__field {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
}

.track__field span {
    font-size: 0.8125rem;
    color: var(--text-2);
    font-weight: 600;
}

.track__field--full {
    grid-column: 1 / -1;
}

.track__actions {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
    margin-bottom: var(--s-2);
}

.track__entries {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: var(--s-3);
}

.track__entries-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--s-2);
}

.track__entries-title {
    margin: 0;
    font-size: 1rem;
}

.track__entries-total {
    margin: 0;
    color: var(--text-2);
    font-weight: 600;
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
    font-size: 0.75rem;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.track-table td {
    word-break: break-word;
}

.track-table__actions {
    width: 110px;
}

.btn-sm {
    padding: 6px 10px;
    font-size: 0.875rem;
}

.alert--inline {
    margin-bottom: var(--s-4);
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@media (max-width: 980px) {
    .track__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 760px) {
    .track {
        padding: var(--s-4);
    }
    .track__header {
        align-items: flex-start;
        gap: var(--s-2);
        flex-direction: column;
    }
    .track__grid {
        grid-template-columns: 1fr;
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
        border-radius: var(--r-sm);
        padding: var(--s-2);
        background: var(--surface);
    }

    .track-table td {
        border: 0;
        padding: var(--s-1) 0;
    }

    .track-table td::before {
        content: attr(data-label);
        display: block;
        font-size: 0.75rem;
        color: var(--text-3);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 700;
        margin-bottom: 2px;
    }

    .track-table__actions {
        width: auto;
    }
}
</style>
