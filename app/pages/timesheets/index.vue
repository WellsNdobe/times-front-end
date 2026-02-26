<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { ref, computed, onMounted } from "vue"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import {
    timesheetEntriesApi,
    type TimesheetEntry,
    type TimesheetEntryPayload,
} from "~/api/timesheetEntriesApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

type TimesheetEntryRow = Omit<TimesheetEntry, "durationMinutes"> & {
    durationMinutes?: number | null | ""
    isNew?: boolean
    isSaving?: boolean
    isDeleting?: boolean
    error?: UiError | null
}

const org = ref<Organization | null>(null)
const projects = ref<Project[]>([])
const timesheet = ref<Timesheet | null>(null)
const entries = ref<TimesheetEntryRow[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)
const submitting = ref(false)
const creatingTimesheet = ref(false)

const currentWeekStart = computed(() => formatDateForInput(getWeekStart(new Date())))
const maxWeekStartDate = computed(() =>
    formatDateForInput(addDays(getWeekStart(new Date()), 7))
)

const weekStartDate = ref(currentWeekStart.value)
const weekLabel = computed(() => `Week of ${weekStartDate.value}`)
const isCurrentWeek = computed(() => weekStartDate.value === currentWeekStart.value)
const isFutureWeek = computed(() => weekStartDate.value > currentWeekStart.value)
const isAtMaxWeek = computed(() => weekStartDate.value >= maxWeekStartDate.value)
const timesheetStatusLabel = computed(() => {
    if (!timesheet.value?.id) return "Not created"
    const status = timesheet.value?.status
    if (status === 1) return "Submitted"
    if (status === 2) return "Approved"
    if (status === 3) return "Rejected"
    return "Draft"
})
const submitButtonLabel = computed(() => {
    if (submitting.value) return "Submitting..."
    const status = timesheet.value?.status
    if (status === 1) return "Submitted"
    if (status === 2) return "Approved"
    if (status === 3) return "Update"
    return "Submit timesheet"
})
const showRejectionBanner = computed(() => timesheet.value?.status === 3)
const rejectionReason = computed(() => {
    const reason = timesheet.value?.rejectionReason
    if (typeof reason === "string" && reason.trim().length) return reason.trim()
    return "No rejection reason was provided."
})
const isEditable = computed(() => {
    const status = timesheet.value?.status
    return status === undefined || status === 0 || status === 3
})
const canSubmit = computed(() => {
    if (!timesheet.value?.id) return false
    if (!isEditable.value) return false
    if (isFutureWeek.value) return false
    return entries.value.length > 0
})

async function loadTimesheet() {
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
        const projectsResult = await projectsApi.list(org.value.id)
        projects.value = projectsResult
        await loadSelectedWeek()
    } catch (e) {
        console.error("Load timesheet error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

async function getTimesheetForWeek(organizationId: string, weekStart: string) {
    const existing = await timesheetsApi.listMine(organizationId, {
        fromWeekStart: weekStart,
        toWeekStart: weekStart,
    })
    return existing?.[0] ?? null
}

async function loadSelectedWeek() {
    if (!org.value?.id) return
    loading.value = true
    error.value = null
    try {
        const timesheetResult = await getTimesheetForWeek(org.value.id, weekStartDate.value)
        timesheet.value = timesheetResult
        entries.value = timesheetResult ? await loadEntries(org.value.id, timesheetResult.id) : []
    } catch (e) {
        console.error("Load selected week error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

function moveWeek(offset: number) {
    const current = new Date(weekStartDate.value)
    current.setDate(current.getDate() + offset * 7)
    const nextWeekStart = formatDateForInput(getWeekStart(current))
    const clampedWeekStart =
        offset > 0 && nextWeekStart > maxWeekStartDate.value ? maxWeekStartDate.value : nextWeekStart

    if (clampedWeekStart === weekStartDate.value) return
    weekStartDate.value = clampedWeekStart
    loadSelectedWeek()
}

function goToCurrentWeek() {
    if (isCurrentWeek.value) return
    weekStartDate.value = formatDateForInput(getWeekStart(new Date()))
    loadSelectedWeek()
}

async function createTimesheetForSelectedWeek() {
    if (!org.value?.id || timesheet.value?.id) return
    creatingTimesheet.value = true
    error.value = null
    try {
        timesheet.value = await timesheetsApi.create(org.value.id, {
            weekStartDate: weekStartDate.value,
        })
        entries.value = []
    } catch (e) {
        console.error("Create timesheet error:", e)
        error.value = toUiError(e)
    } finally {
        creatingTimesheet.value = false
    }
}

async function loadEntries(organizationId: string, timesheetId: string) {
    const result = await timesheetEntriesApi.list(organizationId, timesheetId)
    return result.map((entry) => ({ ...entry, error: null }))
}

function addEntryRow() {
    if (!timesheet.value?.id) return
    const draft: TimesheetEntryRow = {
        id: `new-${Date.now()}`,
        isNew: true,
        projectId: "",
        taskId: null,
        workDate: weekStartDate.value,
        startTime: null,
        endTime: null,
        durationMinutes: null,
        notes: null,
        error: null,
    }
    entries.value = [...entries.value, draft]
}

async function saveEntry(entry: TimesheetEntryRow) {
    if (!org.value?.id || !timesheet.value?.id) return
    entry.error = null
    if (!entry.projectId || !entry.workDate) {
        entry.error = {
            title: "Missing details",
            message: "Project and work date are required before saving.",
        }
        return
    }
    entry.isSaving = true
    try {
        const payload: TimesheetEntryPayload = {
            projectId: entry.projectId,
            taskId: entry.taskId ?? null,
            workDate: entry.workDate,
            startTime: entry.startTime || null,
            endTime: entry.endTime || null,
            durationMinutes: normalizeDurationMinutes(entry.durationMinutes),
            notes: entry.notes || null,
        }
        const savedEntry = entry.isNew
            ? await timesheetEntriesApi.create(org.value.id, timesheet.value.id, payload)
            : await timesheetEntriesApi.update(
                  org.value.id,
                  timesheet.value.id,
                  entry.id,
                  payload
              )
        const updated = { ...savedEntry, error: null }
        entries.value = entries.value.map((row) => (row.id === entry.id ? updated : row))
    } catch (e) {
        console.error("Save timesheet entry error:", e)
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
        console.error("Delete timesheet entry error:", e)
        entry.error = toUiError(e)
    } finally {
        entry.isDeleting = false
    }
}

onMounted(() => loadTimesheet())

function onDurationInput(entry: TimesheetEntryRow, event: Event) {
    const value = (event.target as HTMLInputElement).value
    if (value === "") {
        entry.durationMinutes = null
        return
    }
    entry.durationMinutes = Number(value)
}

function normalizeDurationMinutes(value: TimesheetEntryRow["durationMinutes"]) {
    if (value === null || value === undefined || value === "") return null
    return Number(value)
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

function formatDateForInput(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

async function submitTimesheet() {
    if (!org.value?.id || !timesheet.value?.id) return
    if (!canSubmit.value) return
    submitting.value = true
    try {
        const updated = await timesheetsApi.submit(org.value.id, timesheet.value.id)
        timesheet.value = updated
    } catch (e) {
        console.error("Submit timesheet error:", e)
        error.value = toUiError(e)
    } finally {
        submitting.value = false
    }
}
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
                <span class="timesheets__week-status">{{ timesheetStatusLabel }}</span>
                <div class="timesheets__week-actions">
                    <button type="button" class="btn btn-secondary btn-sm" @click="moveWeek(-1)">
                        Previous
                    </button>
                    <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="isCurrentWeek"
                        @click="goToCurrentWeek"
                    >
                        This week
                    </button>
                    <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="isAtMaxWeek"
                        @click="moveWeek(1)"
                    >
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
            <p class="muted">Loading timesheetâ€¦</p>
        </template>

        <template v-else>
            <div class="timesheets__toolbar">
                <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="loading || !timesheet || !isEditable"
                    @click="addEntryRow"
                >
                    Add row
                </button>
                <button
                    type="button"
                    class="btn btn-secondary"
                    :disabled="loading || submitting || !canSubmit"
                    :title="
                        isFutureWeek
                            ? 'You can plan ahead, but submission is only enabled when the week begins.'
                            : undefined
                    "
                    @click="submitTimesheet"
                >
                    {{ submitButtonLabel }}
                </button>
            </div>

            <div v-if="!timesheet" class="timesheets__empty-week">
                <p class="muted">
                    No timesheet exists for this week yet. Create one to start entering hours.
                </p>
                <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="creatingTimesheet || loading"
                    @click="createTimesheetForSelectedWeek"
                >
                    {{ creatingTimesheet ? "Creating..." : "Create timesheet" }}
                </button>
            </div>

            <div v-else class="timesheets__table-wrap">
                <table class="timesheets-table" v-if="entries.length">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Work date</th>
                            <th>Duration (min)</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Notes</th>
                            <th class="timesheets-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in entries" :key="entry.id">
                            <td data-label="Project">
                                <select
                                    v-model="entry.projectId"
                                    class="table-select"
                                    :disabled="!isEditable"
                                >
                                    <option value="">Select project</option>
                                    <option
                                        v-for="project in projects"
                                        :key="project.id"
                                        :value="project.id"
                                    >
                                        {{ project.name }}
                                    </option>
                                </select>
                            </td>
                            <td data-label="Work date">
                                <input
                                    v-model="entry.workDate"
                                    type="date"
                                    class="table-input"
                                    :disabled="!isEditable"
                                />
                            </td>
                            <td data-label="Duration (min)">
                                <input
                                    :value="entry.durationMinutes ?? ''"
                                    type="number"
                                    @input="onDurationInput(entry, $event)"
                                    class="table-input"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                    :disabled="!isEditable"
                                />
                            </td>
                            <td data-label="Start">
                                <input
                                    v-model="entry.startTime"
                                    type="time"
                                    class="table-input"
                                    :disabled="!isEditable"
                                />
                            </td>
                            <td data-label="End">
                                <input
                                    v-model="entry.endTime"
                                    type="time"
                                    class="table-input"
                                    :disabled="!isEditable"
                                />
                            </td>
                            <td data-label="Notes">
                                <input
                                    v-model="entry.notes"
                                    type="text"
                                    class="table-input"
                                    placeholder="Optional notes"
                                    :disabled="!isEditable"
                                />
                            </td>
                            <td class="timesheets-table__actions" data-label="Actions">
                                <div class="timesheets__row-actions">
                                    <button
                                        type="button"
                                        class="btn btn-primary btn-sm"
                                        :disabled="!isEditable || entry.isSaving || entry.isDeleting"
                                        @click="saveEntry(entry)"
                                    >
                                        {{ entry.isSaving ? "Savingâ€¦" : entry.isNew ? "Add" : "Save" }}
                                    </button>
                                    <button
                                        type="button"
                                        class="btn btn-secondary btn-sm"
                                        :disabled="!isEditable || entry.isDeleting || entry.isSaving"
                                        @click="deleteEntry(entry)"
                                    >
                                        {{ entry.isDeleting ? "Removingâ€¦" : "Delete" }}
                                    </button>
                                </div>
                                <div v-if="entry.error" class="alert alert--inline">
                                    {{ entry.error.message }}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="muted">No entries yet. Add your first row.</p>
                <div v-if="showRejectionBanner" class="timesheets__rejection-banner" role="status">
                    <strong>Rejected:</strong> {{ rejectionReason }}
                </div>
            </div>
        </template>
    </section>
</template>

<style scoped>
.timesheets {
    padding: var(--s-5);
}

.timesheets__header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
}

.timesheets__title {
    margin: 0 0 var(--s-1) 0;
    font-size: 1.5rem;
}

.timesheets__subtitle {
    margin: 0;
    color: var(--text-2);
    font-size: 0.95rem;
}

.timesheets__week {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    text-align: right;
}

.timesheets__week-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
}

.timesheets__week-date {
    font-weight: 600;
}

.timesheets__week-status {
    font-size: 0.8rem;
    color: var(--text-2);
}

.timesheets__week-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
    margin-top: var(--s-2);
}

.timesheets__toolbar {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
}

.timesheets__empty-week {
    border: 1px dashed var(--border);
    border-radius: var(--r-md);
    padding: var(--s-4);
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
}

.timesheets__table-wrap {
    overflow-x: auto;
}

.timesheets-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}

.timesheets-table th,
.timesheets-table td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
}

.timesheets-table td {
    word-break: break-word;
}

.timesheets-table th {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
}

.timesheets-table__actions {
    width: 200px;
}

.table-input,
.table-select {
    min-width: 0;
    width: 100%;
}

.timesheets__row-actions {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.btn-sm {
    padding: 6px 10px;
    font-size: 0.875rem;
}

.timesheets :deep(.btn:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
}

.timesheets__rejection-banner {
    margin-top: 0;
    border: 1px solid #f0b46c;
    border-top: 0;
    border-radius: 0 0 var(--r-md) var(--r-md);
    padding: var(--s-3) var(--s-4);
    background: #fff1df;
    color: #8d4e07;
    font-size: 0.95rem;
}

.alert--inline {
    margin-top: var(--s-2);
    padding: var(--s-2);
    font-size: 0.875rem;
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@media (max-width: 900px) {
    .timesheets__week {
        text-align: left;
    }

    .timesheets__week-actions {
        justify-content: flex-start;
        flex-wrap: wrap;
    }

    .timesheets-table,
    .timesheets-table thead,
    .timesheets-table tbody,
    .timesheets-table tr,
    .timesheets-table th,
    .timesheets-table td {
        display: block;
    }

    .timesheets-table thead {
        display: none;
    }

    .timesheets-table tbody {
        display: grid;
        gap: var(--s-2);
    }

    .timesheets-table tr {
        border: 1px solid var(--border);
        border-radius: var(--r-sm);
        background: var(--surface);
        padding: var(--s-2) var(--s-3);
    }

    .timesheets-table td {
        border: 0;
        padding: var(--s-1) 0;
    }

    .timesheets-table td::before {
        content: attr(data-label);
        display: block;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-3);
        margin-bottom: 2px;
    }

    .timesheets-table__actions {
        width: auto;
    }
}
</style>

