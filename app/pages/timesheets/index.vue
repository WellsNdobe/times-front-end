<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

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

const weekStartDate = ref(formatDateForInput(getWeekStart(new Date())))
const weekLabel = computed(() => `Week of ${weekStartDate.value}`)

async function loadTimesheet() {
    loading.value = true
    error.value = null
    try {
        const orgs = await organizationsApi.getMine()
        if (!orgs?.length) {
            error.value = { title: "No organization", message: "Create an organization first." }
            return
        }
        org.value = orgs[0]
        if (!org.value?.id) return
        const [projectsResult, timesheetResult] = await Promise.all([
            projectsApi.list(org.value.id),
            loadTimesheetForWeek(org.value.id, weekStartDate.value),
        ])
        projects.value = projectsResult
        timesheet.value = timesheetResult
        entries.value = timesheetResult
            ? await loadEntries(org.value.id, timesheetResult.id)
            : []
    } catch (e) {
        console.error("Load timesheet error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

async function loadTimesheetForWeek(organizationId: string, weekStart: string) {
    const existing = await timesheetsApi.list(organizationId, { weekStartDate: weekStart })
    return existing?.[0] ?? null
}

async function loadEntries(organizationId: string, timesheetId: string) {
    const result = await timesheetEntriesApi.list(organizationId, timesheetId)
    return result.map((entry) => ({ ...entry, error: null }))
}

function addEntryRow() {
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

function formatDateForInput(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
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
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading && !entries.length">
            <p class="muted">Loading timesheet…</p>
        </template>

        <template v-else>
            <div class="timesheets__toolbar">
                <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="loading || !timesheet"
                    @click="addEntryRow"
                >
                    Add row
                </button>
            </div>

            <div class="timesheets__table-wrap">
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
                            <td>
                                <select v-model="entry.projectId" class="table-select">
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
                            <td>
                                <input
                                    v-model="entry.workDate"
                                    type="date"
                                    class="table-input"
                                />
                            </td>
                            <td>
                                <input
                                    :value="entry.durationMinutes ?? ''"
                                    type="number"
                                    @input="onDurationInput(entry, $event)"
                                    class="table-input"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                />
                            </td>
                            <td>
                                <input
                                    v-model="entry.startTime"
                                    type="time"
                                    class="table-input"
                                />
                            </td>
                            <td>
                                <input v-model="entry.endTime" type="time" class="table-input" />
                            </td>
                            <td>
                                <input
                                    v-model="entry.notes"
                                    type="text"
                                    class="table-input"
                                    placeholder="Optional notes"
                                />
                            </td>
                            <td class="timesheets-table__actions">
                                <div class="timesheets__row-actions">
                                    <button
                                        type="button"
                                        class="btn btn-primary btn-sm"
                                        :disabled="entry.isSaving || entry.isDeleting"
                                        @click="saveEntry(entry)"
                                    >
                                        {{ entry.isSaving ? "Saving…" : entry.isNew ? "Add" : "Save" }}
                                    </button>
                                    <button
                                        type="button"
                                        class="btn btn-secondary btn-sm"
                                        :disabled="entry.isDeleting || entry.isSaving"
                                        @click="deleteEntry(entry)"
                                    >
                                        {{ entry.isDeleting ? "Removing…" : "Delete" }}
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

.timesheets__toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--s-3);
}

.timesheets__table-wrap {
    overflow-x: auto;
}

.timesheets-table {
    width: 100%;
    border-collapse: collapse;
}

.timesheets-table th,
.timesheets-table td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
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
    min-width: 130px;
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

.alert--inline {
    margin-top: var(--s-2);
    padding: var(--s-2);
    font-size: 0.875rem;
}

.muted {
    margin: 0;
    color: var(--text-2);
}
</style>
