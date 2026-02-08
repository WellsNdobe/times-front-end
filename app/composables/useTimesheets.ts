import { computed, ref } from "vue"
import { organizationsApi, type Organization } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import {
    timesheetEntriesApi,
    type TimesheetEntry,
    type TimesheetEntryPayload,
} from "~/api/timesheetEntriesApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

type TimesheetEntryRow = TimesheetEntry & {
    isNew?: boolean
    isSaving?: boolean
    isDeleting?: boolean
    error?: UiError | null
}

export function useTimesheets() {
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
                ensureTimesheet(org.value.id, weekStartDate.value),
            ])
            projects.value = projectsResult
            timesheet.value = timesheetResult
            entries.value = await loadEntries(org.value.id, timesheetResult.id)
        } catch (e) {
            console.error("Load timesheet error:", e)
            error.value = toUiError(e)
        } finally {
            loading.value = false
        }
    }

    async function ensureTimesheet(organizationId: string, weekStart: string) {
        const existing = await timesheetsApi.list(organizationId, { weekStartDate: weekStart })
        if (existing?.length) return existing[0]
        return timesheetsApi.create(organizationId, { weekStartDate: weekStart })
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
                durationMinutes:
                    entry.durationMinutes === null || entry.durationMinutes === undefined
                        ? null
                        : Number(entry.durationMinutes),
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
            entries.value = entries.value.map((row) =>
                row.id === entry.id ? updated : row
            )
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

    return {
        org,
        projects,
        timesheet,
        entries,
        loading,
        error,
        weekStartDate,
        weekLabel,
        loadTimesheet,
        addEntryRow,
        saveEntry,
        deleteEntry,
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
