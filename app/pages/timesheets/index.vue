<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref } from "vue"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import {
    timesheetEntriesApi,
    type TimesheetEntry,
    type TimesheetEntryPayload,
} from "~/api/timesheetEntriesApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

type TimesheetEntryRow = Omit<TimesheetEntry, "durationMinutes"> & {
    durationMinutes?: number | null | ""
    isNew?: boolean
    isSaving?: boolean
    isDeleting?: boolean
    lastSavedSignature?: string | null
    error?: UiError | null
}

type WorkingDay = {
    key: string
    label: string
    date: string
    displayDate: string
}

const WORKING_DAY_COUNT = 5

const org = ref<Organization | null>(null)
const projects = ref<Project[]>([])
const timesheet = ref<Timesheet | null>(null)
const entries = ref<TimesheetEntryRow[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)
const creatingTimesheet = ref(false)
const submitting = ref(false)

const currentWeekStart = computed(() => formatDateForInput(getWeekStart(new Date())))
const maxWeekStartDate = computed(() => formatDateForInput(addDays(getWeekStart(new Date()), 7)))
const weekStartDate = ref(currentWeekStart.value)

const weekLabel = computed(() => `Week of ${weekStartDate.value}`)
const isCurrentWeek = computed(() => weekStartDate.value === currentWeekStart.value)
const isFutureWeek = computed(() => weekStartDate.value > currentWeekStart.value)
const isAtMaxWeek = computed(() => weekStartDate.value >= maxWeekStartDate.value)

const timesheetStatusLabel = computed(() => {
    if (!timesheet.value?.id) return "Not created"
    if (timesheet.value.status === 1) return "Submitted"
    if (timesheet.value.status === 2) return "Approved"
    if (timesheet.value.status === 3) return "Rejected"
    return "Draft"
})
const timesheetStatusToneClass = computed(() => {
    if (!timesheet.value?.id) return "timesheets__status-chip--neutral"
    if (timesheet.value.status === 1) return "timesheets__status-chip--info"
    if (timesheet.value.status === 2) return "timesheets__status-chip--success"
    if (timesheet.value.status === 3) return "timesheets__status-chip--warning"
    return "timesheets__status-chip--neutral"
})

const submitButtonLabel = computed(() => {
    if (submitting.value) return "Submitting..."
    if (timesheet.value?.status === 1) return "Already submitted"
    if (timesheet.value?.status === 2) return "Approved"
    if (timesheet.value?.status === 3) return "Resubmit timesheet"
    return "Submit timesheet"
})

const isEditable = computed(() => {
    const status = timesheet.value?.status
    return status === undefined || status === 0 || status === 3
})

const canSubmit = computed(() => {
    if (!timesheet.value?.id || !isEditable.value || isFutureWeek.value) return false
    return entries.value.length > 0
})
const isSubmitButtonUsable = computed(() => !loading.value && !submitting.value && canSubmit.value)

const showRejectionBanner = computed(() => timesheet.value?.status === 3)
const rejectionReason = computed(() => {
    const reason = timesheet.value?.rejectionReason
    return typeof reason === "string" && reason.trim().length
        ? reason.trim()
        : "No rejection reason was provided."
})
const readOnlyBannerMessage = computed(() => {
    if (timesheet.value?.status === 1) {
        return "This timesheet is submitted. Rows are locked while it awaits approval."
    }
    if (timesheet.value?.status === 2) {
        return "This timesheet is approved. Rows are now read-only."
    }
    return ""
})

const workingDays = computed<WorkingDay[]>(() => getWorkingDays(weekStartDate.value))
const entriesByWorkDate = computed(() => {
    const grouped = new Map<string, TimesheetEntryRow[]>()
    for (const day of workingDays.value) grouped.set(day.date, [])
    for (const entry of entries.value) {
        const bucket = grouped.get(entry.workDate)
        if (bucket) bucket.push(entry)
    }
    return grouped
})

const weekTotalMinutes = computed(() =>
    entries.value.reduce((sum, entry) => sum + toMinutes(entry.durationMinutes), 0)
)

function dayEntries(date: string) {
    return entriesByWorkDate.value.get(date) ?? []
}

function dayTotalMinutes(date: string) {
    return dayEntries(date).reduce((sum, entry) => sum + toMinutes(entry.durationMinutes), 0)
}

function addEntryRow(workDate: string) {
    if (!timesheet.value?.id) return
    const row: TimesheetEntryRow = {
        id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        isNew: true,
        projectId: "",
        taskId: null,
        workDate,
        startTime: null,
        endTime: null,
        durationMinutes: null,
        notes: null,
        lastSavedSignature: null,
        error: null,
    }
    entries.value = [...entries.value, row]
}

async function loadTimesheet() {
    loading.value = true
    error.value = null
    try {
        const orgs = await organizationsApi.getMine()
        if (!orgs?.length) {
            error.value = { title: "No organization", message: "Create an organization first." }
            return
        }
        org.value = orgs[0] ?? null
        if (!org.value?.id) return
        projects.value = await projectsApi.list(org.value.id)
        await loadSelectedWeek()
    } catch (e) {
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

async function getTimesheetForWeek(organizationId: string, weekStart: string) {
    const list = await timesheetsApi.listMine(organizationId, {
        fromWeekStart: weekStart,
        toWeekStart: weekStart,
    })
    return list?.[0] ?? null
}

async function loadSelectedWeek() {
    if (!org.value?.id) return
    loading.value = true
    error.value = null
    try {
        const sheet = await getTimesheetForWeek(org.value.id, weekStartDate.value)
        timesheet.value = sheet
        entries.value = sheet ? await loadEntries(org.value.id, sheet.id) : []
    } catch (e) {
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

async function loadEntries(organizationId: string, timesheetId: string) {
    const result = await timesheetEntriesApi.list(organizationId, timesheetId)
    return result.map((entry) => {
        const row: TimesheetEntryRow = { ...entry, error: null, isNew: false }
        row.lastSavedSignature = getEntrySignature(row)
        return row
    })
}

function moveWeek(offset: number) {
    const current = parseDateInput(weekStartDate.value)
    current.setDate(current.getDate() + offset * 7)
    const nextWeekStart = formatDateForInput(getWeekStart(current))
    const clampedWeekStart =
        offset > 0 && nextWeekStart > maxWeekStartDate.value ? maxWeekStartDate.value : nextWeekStart
    if (clampedWeekStart === weekStartDate.value) return
    weekStartDate.value = clampedWeekStart
    void loadSelectedWeek()
}

function goToCurrentWeek() {
    if (isCurrentWeek.value) return
    weekStartDate.value = currentWeekStart.value
    void loadSelectedWeek()
}

async function createTimesheetForSelectedWeek() {
    if (!org.value?.id || timesheet.value?.id) return
    creatingTimesheet.value = true
    error.value = null
    try {
        timesheet.value = await timesheetsApi.create(org.value.id, { weekStartDate: weekStartDate.value })
        entries.value = []
    } catch (e) {
        error.value = toUiError(e)
    } finally {
        creatingTimesheet.value = false
    }
}

async function saveEntry(entry: TimesheetEntryRow) {
    if (!org.value?.id || !timesheet.value?.id) return
    entry.error = null
    if (!entry.projectId || !entry.workDate) {
        entry.error = { title: "Missing details", message: "Project and work date are required." }
        return
    }
    entry.isSaving = true
    try {
        const payload = buildEntryPayload(entry)
        const saved = entry.isNew
            ? await timesheetEntriesApi.create(org.value.id, timesheet.value.id, payload)
            : await timesheetEntriesApi.update(org.value.id, timesheet.value.id, entry.id, payload)
        const nextRow: TimesheetEntryRow = { ...saved, error: null, isNew: false }
        nextRow.lastSavedSignature = getEntrySignature(nextRow)
        entries.value = entries.value.map((row) =>
            row.id === entry.id ? nextRow : row
        )
    } catch (e) {
        entry.error = toUiError(e)
    } finally {
        entry.isSaving = false
    }
}

async function deleteEntry(entry: TimesheetEntryRow) {
    if (entry.isDeleting) return
    entry.error = null
    if (entry.isNew) {
        entries.value = entries.value.filter((row) => row.id !== entry.id)
        return
    }
    if (!org.value?.id || !timesheet.value?.id) return
    entry.isDeleting = true
    try {
        await timesheetEntriesApi.remove(org.value.id, timesheet.value.id, entry.id)
        entries.value = entries.value.filter((row) => row.id !== entry.id)
    } catch (e) {
        entry.error = toUiError(e)
    } finally {
        entry.isDeleting = false
    }
}

async function submitTimesheet() {
    if (!org.value?.id || !timesheet.value?.id || !canSubmit.value) return
    submitting.value = true
    try {
        timesheet.value = await timesheetsApi.submit(org.value.id, timesheet.value.id)
    } catch (e) {
        error.value = toUiError(e)
    } finally {
        submitting.value = false
    }
}

function onDurationInput(entry: TimesheetEntryRow, event: Event) {
    const value = (event.target as HTMLInputElement).value
    entry.durationMinutes = value === "" ? null : Number(value)
}

function buildEntryPayload(entry: TimesheetEntryRow): TimesheetEntryPayload {
    return {
        projectId: entry.projectId,
        taskId: entry.taskId ?? null,
        workDate: entry.workDate,
        startTime: entry.startTime || null,
        endTime: entry.endTime || null,
        durationMinutes: normalizeDurationMinutes(entry.durationMinutes),
        notes: entry.notes || null,
    }
}

function getEntrySignature(entry: TimesheetEntryRow) {
    return JSON.stringify(buildEntryPayload(entry))
}

function hasUnsavedChanges(entry: TimesheetEntryRow) {
    if (entry.isNew) return true
    return getEntrySignature(entry) !== (entry.lastSavedSignature ?? null)
}

function rowSaveLabel(entry: TimesheetEntryRow) {
    if (!isEditable.value) return "Locked"
    if (entry.isSaving) return entry.isNew ? "Adding..." : "Saving..."
    if (entry.isNew) return "Add row"
    return hasUnsavedChanges(entry) ? "Save changes" : "Saved"
}

function rowDeleteLabel(entry: TimesheetEntryRow) {
    if (entry.isDeleting) return "Removing..."
    if (!isEditable.value) return "Locked"
    return entry.isNew ? "Discard" : "Delete"
}

function rowSaveDisabled(entry: TimesheetEntryRow) {
    if (!isEditable.value || entry.isSaving || entry.isDeleting) return true
    if (entry.isNew) return false
    return !hasUnsavedChanges(entry)
}

function normalizeDurationMinutes(value: TimesheetEntryRow["durationMinutes"]) {
    if (value === null || value === undefined || value === "") return null
    return Number(value)
}

function toMinutes(value: TimesheetEntryRow["durationMinutes"]) {
    if (value === null || value === undefined || value === "") return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatMinutes(total: number) {
    const whole = Math.max(0, Math.round(total))
    const hours = Math.floor(whole / 60)
    const minutes = whole % 60
    if (!hours) return `${minutes}m`
    if (!minutes) return `${hours}h`
    return `${hours}h ${minutes}m`
}

function parseDateInput(value: string) {
    const [year, month, day] = value.split("-").map((part) => Number(part))
    return new Date(year, (month || 1) - 1, day || 1)
}

function getWeekStart(date: Date) {
    const start = new Date(date)
    const diff = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - diff)
    start.setHours(0, 0, 0, 0)
    return start
}

function getWorkingDays(weekStart: string) {
    const start = parseDateInput(weekStart)
    const days: WorkingDay[] = []
    for (let i = 0; i < WORKING_DAY_COUNT; i += 1) {
        const date = addDays(start, i)
        days.push({
            key: `${weekStart}-${i}`,
            label: date.toLocaleDateString(undefined, { weekday: "long" }),
            date: formatDateForInput(date),
            displayDate: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        })
    }
    return days
}

function addDays(date: Date, days: number) {
    const copy = new Date(date)
    copy.setDate(copy.getDate() + days)
    return copy
}

function formatDateForInput(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
}

onMounted(() => {
    void loadTimesheet()
})
</script>

<template>
    <section class="card timesheets">
        <header class="timesheets__header">
            <div>
                <h1 class="timesheets__title">Timesheets</h1>
                <p v-if="org" class="timesheets__subtitle">{{ org.name }}</p>
            </div>
            <div class="timesheets__week">
                <span class="timesheets__week-label">Week</span>
                <span class="timesheets__week-date">{{ weekLabel }}</span>
                <span class="timesheets__week-status timesheets__status-chip" :class="timesheetStatusToneClass">
                    {{ timesheetStatusLabel }}
                </span>
                <div class="timesheets__week-actions">
                    <button type="button" class="btn btn-secondary btn-sm" @click="moveWeek(-1)">Previous</button>
                    <button type="button" class="btn btn-secondary btn-sm" :disabled="isCurrentWeek" @click="goToCurrentWeek">This week</button>
                    <button type="button" class="btn btn-secondary btn-sm" :disabled="isAtMaxWeek" @click="moveWeek(1)">
                        Next
                    </button>
                </div>
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading && !entries.length">
            <p class="muted">Loading timesheet...</p>
        </template>

        <template v-else>
            <div class="timesheets__toolbar">
                <div class="timesheets__total">
                    <span>Week total</span>
                    <strong>{{ formatMinutes(weekTotalMinutes) }}</strong>
                </div>
                <button
                    type="button"
                    class="btn"
                    :class="isSubmitButtonUsable ? 'timesheets__submit-btn--active' : 'timesheets__submit-btn--inactive'"
                    :disabled="loading || submitting || !canSubmit"
                    @click="submitTimesheet"
                >
                    {{ submitButtonLabel }}
                </button>
            </div>
            <div v-if="readOnlyBannerMessage" class="timesheets__readonly-banner" role="status">
                {{ readOnlyBannerMessage }}
            </div>

            <div v-if="!timesheet" class="timesheets__empty-week">
                <p class="muted">No timesheet exists for this week yet. Create one to start entering hours.</p>
                <button type="button" class="btn btn-primary" :disabled="creatingTimesheet || loading" @click="createTimesheetForSelectedWeek">
                    {{ creatingTimesheet ? "Creating..." : "Create timesheet" }}
                </button>
            </div>

            <div v-else class="timesheets__days">
                <section v-for="day in workingDays" :key="day.key" class="timesheets-day">
                    <header class="timesheets-day__header">
                        <div>
                            <h2>{{ day.label }}</h2>
                            <p>{{ day.displayDate }}</p>
                        </div>
                        <div class="timesheets-day__meta">
                            <div>
                                <span>Day total</span>
                                <strong>{{ formatMinutes(dayTotalMinutes(day.date)) }}</strong>
                            </div>
                            <button
                                type="button"
                                class="btn btn-primary btn-sm"
                                :disabled="loading || !timesheet || !isEditable"
                                @click="addEntryRow(day.date)"
                            >
                                {{ isEditable ? "Add row" : "Rows locked" }}
                            </button>
                        </div>
                    </header>

                    <div class="timesheets-day__body">
                        <table v-if="dayEntries(day.date).length" class="timesheets-table">
                            <thead>
                                <tr>
                                    <th>Project</th>
                                    <th>Duration (min)</th>
                                    <th>Start</th>
                                    <th>End</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="entry in dayEntries(day.date)" :key="entry.id">
                                    <td>
                                        <select v-model="entry.projectId" :disabled="!isEditable">
                                            <option value="">Select project</option>
                                            <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
                                        </select>
                                    </td>
                                    <td>
                                        <input :value="entry.durationMinutes ?? ''" type="number" min="0" step="1" :disabled="!isEditable" @input="onDurationInput(entry, $event)" />
                                    </td>
                                    <td><input v-model="entry.startTime" type="time" :disabled="!isEditable" /></td>
                                    <td><input v-model="entry.endTime" type="time" :disabled="!isEditable" /></td>
                                    <td><input v-model="entry.notes" type="text" placeholder="Optional notes" :disabled="!isEditable" /></td>
                                    <td>
                                        <div class="timesheets__row-actions">
                                            <button
                                                type="button"
                                                class="btn btn-primary btn-sm"
                                                :disabled="rowSaveDisabled(entry)"
                                                @click="saveEntry(entry)"
                                            >
                                                {{ rowSaveLabel(entry) }}
                                            </button>
                                            <button type="button" class="btn btn-secondary btn-sm" :disabled="!isEditable || entry.isDeleting || entry.isSaving" @click="deleteEntry(entry)">
                                                {{ rowDeleteLabel(entry) }}
                                            </button>
                                        </div>
                                        <div v-if="entry.error" class="alert alert--inline">{{ entry.error.message }}</div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <p v-else class="muted">No entries for this day.</p>
                    </div>
                </section>

                <div v-if="showRejectionBanner" class="timesheets__rejection-banner" role="status">
                    <strong>Rejected:</strong> {{ rejectionReason }}
                </div>
            </div>
        </template>
    </section>
</template>

<style scoped>
.timesheets { padding: var(--s-5); }
.timesheets__header { display: flex; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; margin-bottom: var(--s-4); }
.timesheets__title { margin: 0; }
.timesheets__subtitle { margin: 0; color: var(--text-2); }
.timesheets__week { text-align: right; display: grid; gap: 4px; }
.timesheets__week-label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-3); }
.timesheets__status-chip { display: inline-flex; justify-self: flex-end; align-items: center; width: fit-content; border-radius: var(--r-pill); border: 1px solid transparent; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.03em; padding: 4px 10px; }
.timesheets__status-chip--neutral { background: var(--surface-2); color: var(--text-2); border-color: var(--border); }
.timesheets__status-chip--info { background: var(--info-soft); color: var(--info); border-color: #c7dafd; }
.timesheets__status-chip--success { background: var(--success-soft); color: var(--success); border-color: #ccefd8; }
.timesheets__status-chip--warning { background: var(--warning-soft); color: var(--warning); border-color: #ffe2c1; }
.timesheets__week-actions { display: flex; gap: var(--s-2); justify-content: flex-end; flex-wrap: wrap; }
.timesheets__toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s-3); }
.timesheets__total { display: grid; gap: 2px; }
.timesheets__submit-btn--active { background: var(--success); border-color: var(--success); color: #fff; }
.timesheets__submit-btn--active:hover { background: #15803d; border-color: #15803d; }
.timesheets__submit-btn--inactive { background: #e5e7eb; border-color: #d1d5db; color: #6b7280; cursor: not-allowed; }
.timesheets__submit-btn--inactive:hover { background: #e5e7eb; }
.timesheets__readonly-banner { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); color: var(--text-2); margin-bottom: var(--s-3); padding: var(--s-3) var(--s-4); }
.timesheets__empty-week { border: 1px dashed var(--border); border-radius: var(--r-md); padding: var(--s-4); display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--s-3); }
.timesheets__days { display: grid; gap: var(--s-4); }
.timesheets-day { border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
.timesheets-day__header { padding: var(--s-3) var(--s-4); background: var(--surface-2); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; }
.timesheets-day__header h2 { margin: 0; font-size: 1rem; }
.timesheets-day__header p { margin: 2px 0 0 0; color: var(--text-2); }
.timesheets-day__meta { display: flex; align-items: center; gap: var(--s-3); }
.timesheets-day__meta span { display: block; font-size: 0.75rem; color: var(--text-3); text-transform: uppercase; }
.timesheets-day__body { overflow-x: auto; }
.timesheets-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.timesheets-table th, .timesheets-table td { border-bottom: 1px solid var(--border); padding: var(--s-3); text-align: left; vertical-align: top; }
.timesheets-table tr:last-child td { border-bottom: 0; }
.timesheets-table input, .timesheets-table select { width: 100%; min-width: 0; }
.timesheets__row-actions { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.btn-sm { padding: 6px 10px; font-size: 0.875rem; }
.alert--inline { margin-top: var(--s-2); padding: var(--s-2); font-size: 0.875rem; }
.muted { margin: 0; color: var(--text-2); padding: var(--s-3); }
.timesheets__rejection-banner { border: 1px solid #f0b46c; border-radius: var(--r-md); padding: var(--s-3) var(--s-4); background: #fff1df; color: #8d4e07; }

@media (max-width: 900px) {
    .timesheets__week { text-align: left; }
    .timesheets__status-chip { justify-self: flex-start; }
    .timesheets__week-actions { justify-content: flex-start; }
    .timesheets__toolbar { flex-direction: column; align-items: flex-start; }
}
</style>
