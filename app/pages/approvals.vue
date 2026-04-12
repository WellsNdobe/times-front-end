<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref, watch } from "vue"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { timesheetEntriesApi, type TimesheetEntry } from "~/api/timesheetEntriesApi"
import FilterBar from "~/components/approvals/FilterBar.vue"
import QueueTable from "~/components/approvals/QueueTable.vue"
import { toUiError, type UiError } from "~/utils/errorMessages"
import { useAuth } from "~/composables/useAuth"

type ApprovalRow = Timesheet & {
    uiStatus: "pending" | "approved"
    isApproving: boolean
    isRejecting: boolean
    rejectReason: string
    rejectOpen: boolean
    isExpanded: boolean
    entries?: TimesheetEntry[]
    entriesLoading: boolean
    entriesError: UiError | null
    error: UiError | null
    approvedAtLabel?: string | null
    recentlyApproved: boolean
}

const org = ref<Organization | null>(null)
const approvals = ref<ApprovalRow[]>([])
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)
const mySubmissions = ref<Timesheet[]>([])

const filterEmployeeId = ref("all")
const filterStatus = ref("pending")
const filterDateFrom = ref("")
const filterDateTo = ref("")
const selectedIds = ref<string[]>([])
const approvingAll = ref(false)

const { user } = useAuth()

const memberMap = computed(() => {
    const map = new Map<string, OrganizationMember>()
    for (const member of members.value) map.set(member.userId, member)
    return map
})

const projectById = computed(() => {
    const map = new Map<string, Project>()
    for (const project of projects.value) map.set(project.id, project)
    return map
})

const employeeOptions = computed(() => {
    const map = new Map<string, string>()
    for (const row of approvals.value) {
        const userId = String(row.userId ?? "")
        if (!userId) continue
        map.set(userId, displayName(userId))
    }

    return [
        { value: "all", label: "All Employees" },
        ...[...map.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => left.label.localeCompare(right.label)),
    ]
})

const myMember = computed(() => {
    if (!user.value?.userId) return null
    return members.value.find((member) => member.userId === user.value?.userId) ?? null
})

const isProjectApprover = computed(() => {
    const userId = user.value?.userId
    if (!userId) return false
    return projects.value.some((project) => (project.approverUserIds as string[] | undefined)?.includes(userId))
})

const hasApprovalRole = computed(() => {
    const role = myMember.value?.role
    return role === 0 || role === 1
})

const canReviewApprovals = computed(() =>
    hasApprovalRole.value || isProjectApprover.value || approvals.value.length > 0
)

const filteredApprovals = computed(() => {
    const rows = approvals.value.filter((row) => {
        if (filterEmployeeId.value !== "all" && row.userId !== filterEmployeeId.value) return false
        if (filterStatus.value !== "all" && row.uiStatus !== filterStatus.value) return false
        if (filterDateFrom.value && (row.weekStartDate ?? "") < filterDateFrom.value) return false
        if (filterDateTo.value && (row.weekEndDate ?? row.weekStartDate ?? "") > filterDateTo.value) return false
        return true
    })

    return [...rows].sort((left, right) => {
        if (left.uiStatus !== right.uiStatus) return left.uiStatus === "pending" ? -1 : 1
        return (left.weekStartDate ?? "").localeCompare(right.weekStartDate ?? "")
    })
})

const pendingRows = computed(() => filteredApprovals.value.filter((row) => row.uiStatus === "pending"))
const pendingQueueCount = computed(() => approvals.value.filter((row) => row.uiStatus === "pending").length)
const pendingHoursTotal = computed(() =>
    approvals.value
        .filter((row) => row.uiStatus === "pending")
        .reduce((sum, row) => sum + resolveHours(row), 0)
)

const allPendingSelected = computed(() => {
    if (!pendingRows.value.length) return false
    return pendingRows.value.every((row) => selectedIds.value.includes(row.id))
})

const queueRows = computed(() =>
    filteredApprovals.value.map((row) => ({
        id: row.id,
        employeeName: displayName(row.userId as string),
        employeeSubtitle: row.recentlyApproved ? "Recently approved" : memberRoleLabel(row.userId as string),
        periodLabel: formatPeriod(row.weekStartDate, row.weekEndDate),
        totalHoursLabel: formatHours(resolveHours(row)),
        statusLabel: row.uiStatus === "approved" ? "Approved" : "Pending",
        statusMeta: row.recentlyApproved ? row.approvedAtLabel ?? "Approved just now" : "",
        isPending: row.uiStatus === "pending",
        isApproving: row.isApproving,
        isRejecting: row.isRejecting,
        rejectOpen: row.rejectOpen,
        rejectReason: row.rejectReason,
        isExpanded: row.isExpanded,
        isSelected: selectedIds.value.includes(row.id),
        recentlyApproved: row.recentlyApproved,
        entriesLoading: row.entriesLoading,
        entriesError: row.entriesError?.message ?? row.entriesError?.title ?? null,
        errorMessage: row.error?.message ?? null,
        detailEntries: (row.entries ?? []).map((entry) => ({
            id: entry.id,
            workDate: formatDateDisplay(entry.workDate),
            projectName: projectName(entry.projectId),
            activity: activityLabel(entry),
            hoursText: formatHours((entry.durationMinutes ?? 0) / 60),
        })),
    }))
)

const queueSummaryLabel = computed(() => {
    const label = pendingQueueCount.value === 1 ? "employee" : "employees"
    return `Showing ${pendingQueueCount.value} ${label} with pending timesheets`
})

const queueSummaryHours = computed(() => formatHours(pendingHoursTotal.value))

watch(
    () => pendingRows.value.map((row) => row.id).join("|"),
    () => {
        const visiblePendingIds = new Set(pendingRows.value.map((row) => row.id))
        selectedIds.value = selectedIds.value.filter((id) => visiblePendingIds.has(id))
    }
)

watch([filterDateFrom, filterDateTo], async () => {
    if (!org.value?.id) return
    await loadApprovals()
})

function displayName(userId?: string) {
    if (!userId) return "Unknown employee"
    const member = memberMap.value.get(userId)
    if (!member) return "Unknown employee"
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
    return name || "Unknown employee"
}

function memberRoleLabel(userId?: string) {
    if (!userId) return "Team member"
    const member = memberMap.value.get(userId)
    if (!member) return "Team member"
    if (member.role === 0) return "Admin"
    if (member.role === 1) return "Manager"
    return "Employee"
}

function projectName(projectId?: string) {
    if (!projectId) return "Unknown project"
    return projectById.value.get(projectId)?.name ?? "Unknown project"
}

function formatDateDisplay(date?: string) {
    if (!date) return "—"
    const parsed = new Date(date)
    if (Number.isNaN(parsed.getTime())) return date
    return parsed.toLocaleDateString(undefined, { month: "short", day: "2-digit" })
}

function formatPeriod(start?: string, end?: string) {
    if (!start && !end) return "—"
    return `${formatDateDisplay(start)} - ${formatDateDisplay(end ?? start)}`
}

function resolveHours(row: Timesheet) {
    if (typeof row.totalHours === "number") return row.totalHours
    if (typeof row.totalMinutes === "number") return row.totalMinutes / 60
    return 0
}

function formatHours(value: number) {
    return `${value.toFixed(1)} hrs`
}

function activityLabel(entry: TimesheetEntry) {
    const notes = typeof entry.notes === "string" ? entry.notes.trim() : ""
    if (notes) return notes
    if (entry.startTime && entry.endTime) return `${entry.startTime} - ${entry.endTime}`
    return "Timesheet entry"
}

function statusLabel(status?: number) {
    if (status === 1) return "Submitted"
    if (status === 2) return "Approved"
    if (status === 3) return "Rejected"
    return "Draft"
}

function normalizeApprovalRow(timesheet: Timesheet): ApprovalRow {
    return {
        ...timesheet,
        uiStatus: "pending",
        isApproving: false,
        isRejecting: false,
        rejectReason: "",
        rejectOpen: false,
        isExpanded: false,
        entries: undefined,
        entriesLoading: false,
        entriesError: null,
        error: null,
        approvedAtLabel: null,
        recentlyApproved: false,
    }
}

function getDateFilterParams() {
    return {
        fromWeekStart: filterDateFrom.value || undefined,
        toWeekStart: filterDateTo.value || undefined,
    }
}

async function loadApprovals() {
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

        const [membersResult, projectsResult, approvalsResult, mineResult] = await Promise.all([
            organizationsApi.getMembers(firstOrg.id),
            projectsApi.list(firstOrg.id),
            timesheetsApi.listPendingApproval(firstOrg.id, getDateFilterParams()),
            timesheetsApi.listMine(firstOrg.id),
        ])

        members.value = membersResult
        projects.value = projectsResult
        approvals.value = approvalsResult.map(normalizeApprovalRow)
        mySubmissions.value = mineResult.filter((timesheet) => timesheet.status !== undefined && timesheet.status !== 0)
    } catch (cause) {
        console.error("Load approvals error:", cause)
        error.value = toUiError(cause)
    } finally {
        loading.value = false
    }
}

async function approveTimesheet(rowId: string) {
    const row = approvals.value.find((item) => item.id === rowId)
    if (!row || !org.value?.id || row.uiStatus !== "pending") return
    row.error = null
    row.isApproving = true
    try {
        await timesheetsApi.approve(org.value.id, row.id)
        row.uiStatus = "approved"
        row.recentlyApproved = true
        row.approvedAtLabel = "Approved just now"
        row.rejectOpen = false
        selectedIds.value = selectedIds.value.filter((id) => id !== row.id)
    } catch (cause) {
        console.error("Approve timesheet error:", cause)
        row.error = toUiError(cause)
    } finally {
        row.isApproving = false
    }
}

async function approveAllPending() {
    const rows = pendingRows.value.filter((row) => !row.isApproving && !row.isRejecting)
    if (!rows.length || approvingAll.value) return
    approvingAll.value = true
    try {
        for (const row of rows) {
            await approveTimesheet(row.id)
        }
    } finally {
        approvingAll.value = false
    }
}

async function rejectTimesheet(rowId: string) {
    const row = approvals.value.find((item) => item.id === rowId)
    if (!row || !org.value?.id) return
    row.error = null
    if (!row.rejectReason.trim()) {
        row.error = {
            title: "Reason required",
            message: "Enter a rejection reason before rejecting this timesheet.",
        }
        return
    }

    row.isRejecting = true
    try {
        await timesheetsApi.reject(org.value.id, row.id, { reason: row.rejectReason.trim() })
        approvals.value = approvals.value.filter((item) => item.id !== row.id)
        selectedIds.value = selectedIds.value.filter((id) => id !== row.id)
    } catch (cause) {
        console.error("Reject timesheet error:", cause)
        row.error = toUiError(cause)
    } finally {
        row.isRejecting = false
    }
}

function toggleReject(rowId: string) {
    approvals.value = approvals.value.map((row) => ({
        ...row,
        rejectOpen: row.id === rowId ? !row.rejectOpen : false,
        error: row.id === rowId ? row.error : null,
    }))
}

function updateRejectReason(payload: { rowId: string; value: string }) {
    const row = approvals.value.find((item) => item.id === payload.rowId)
    if (!row) return
    row.rejectReason = payload.value
}

async function toggleDetails(rowId: string) {
    const row = approvals.value.find((item) => item.id === rowId)
    if (!row || !org.value?.id) return
    row.isExpanded = !row.isExpanded
    if (!row.isExpanded || row.entries || row.entriesLoading) return

    row.entriesLoading = true
    row.entriesError = null
    try {
        row.entries = await timesheetEntriesApi.list(org.value.id, row.id)
    } catch (cause) {
        console.error("Load timesheet entries error:", cause)
        row.entriesError = toUiError(cause)
    } finally {
        row.entriesLoading = false
    }
}

function toggleSelect(payload: { rowId: string; checked: boolean }) {
    const row = approvals.value.find((item) => item.id === payload.rowId)
    if (!row || row.uiStatus !== "pending") return
    if (payload.checked) {
        selectedIds.value = [...new Set([...selectedIds.value, row.id])]
        return
    }
    selectedIds.value = selectedIds.value.filter((id) => id !== row.id)
}

function toggleSelectAll(checked: boolean) {
    selectedIds.value = checked ? pendingRows.value.map((row) => row.id) : []
}

onMounted(loadApprovals)
</script>

<template>
    <section class="approvals-page">
        <header class="approvals-page__hero card">
            <div>
                <p class="approvals-page__breadcrumb">Approvals / Pending Queue</p>
                <h1 class="approvals-page__title">Pending Queue</h1>
                <p class="approvals-page__subtitle">
                    Review submitted timesheets, inspect time breakdowns, and clear the queue without leaving the page.
                </p>
            </div>

            <div class="approvals-page__hero-metrics">
                <div class="approvals-page__metric">
                    <span>Pending employees</span>
                    <strong>{{ pendingQueueCount }}</strong>
                </div>
                <div class="approvals-page__metric">
                    <span>Pending hours</span>
                    <strong>{{ queueSummaryHours }}</strong>
                </div>
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <section class="card approvals-page__loading">
                <p class="muted">Loading approvals queue...</p>
            </section>
        </template>

        <template v-else-if="canReviewApprovals">
            <FilterBar
                :employees="employeeOptions"
                :employee-id="filterEmployeeId"
                :status="filterStatus"
                :date-from="filterDateFrom"
                :date-to="filterDateTo"
                :approve-all-disabled="!pendingRows.length || approvingAll"
                :approve-all-busy="approvingAll"
                @update:employee-id="filterEmployeeId = $event"
                @update:status="filterStatus = $event"
                @update:date-from="filterDateFrom = $event"
                @update:date-to="filterDateTo = $event"
                @approve-all="approveAllPending"
            />

            <QueueTable
                :rows="queueRows"
                :all-pending-selected="allPendingSelected"
                :summary-label="queueSummaryLabel"
                :summary-hours="queueSummaryHours"
                @toggle-select-all="toggleSelectAll"
                @toggle-select="toggleSelect"
                @approve="approveTimesheet"
                @toggle-reject="toggleReject"
                @confirm-reject="rejectTimesheet"
                @update-reject-reason="updateRejectReason"
                @toggle-details="toggleDetails"
            />

            <section v-if="!filteredApprovals.length" class="card approvals-page__empty">
                <p class="approvals-page__empty-title">No queue items match the current filters.</p>
                <p class="muted">Adjust the employee, date range, or status filter to widen the queue.</p>
            </section>
        </template>

        <section v-else class="card approvals-page__fallback">
            <header>
                <p class="approvals-page__breadcrumb">Approvals / My Submissions</p>
                <h1 class="approvals-page__title">My Submission Status</h1>
                <p class="approvals-page__subtitle">
                    You do not currently have approval access, so this page shows the status of your submitted timesheets.
                </p>
            </header>

            <table v-if="mySubmissions.length" class="approvals-page__fallback-table">
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Status</th>
                        <th>Total Hours</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in mySubmissions" :key="row.id">
                        <td>{{ formatPeriod(row.weekStartDate, row.weekEndDate) }}</td>
                        <td>{{ statusLabel(row.status) }}</td>
                        <td>{{ formatHours(resolveHours(row)) }}</td>
                    </tr>
                </tbody>
            </table>
            <p v-else class="muted">No submitted timesheets yet.</p>
        </section>
    </section>
</template>

<style scoped>
.approvals-page {
    display: grid;
    gap: var(--s-4);
}

.approvals-page__hero {
    padding: var(--s-5);
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-4);
}

.approvals-page__breadcrumb {
    margin: 0 0 var(--s-1);
    color: var(--text-3);
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.approvals-page__title {
    margin: 0;
    font-size: clamp(1.45rem, 2.5vw, 2rem);
}

.approvals-page__subtitle {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
    max-width: 720px;
}

.approvals-page__hero-metrics {
    display: flex;
    gap: var(--s-3);
    flex-wrap: wrap;
}

.approvals-page__metric {
    min-width: 150px;
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%);
}

.approvals-page__metric span {
    display: block;
    margin-bottom: 6px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    font-weight: 700;
}

.approvals-page__metric strong {
    font-size: 1.25rem;
}

.approvals-page__loading,
.approvals-page__empty,
.approvals-page__fallback {
    padding: var(--s-5);
}

.approvals-page__empty-title {
    margin: 0 0 var(--s-1);
    font-weight: 700;
}

.approvals-page__fallback-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--s-4);
}

.approvals-page__fallback-table th,
.approvals-page__fallback-table td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--border);
}

.approvals-page__fallback-table th {
    color: var(--text-3);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.alert {
    border: 1px solid #f1c3c3;
    border-radius: var(--r-md);
    background: #fff7f7;
    color: #8a1f1f;
    padding: var(--s-3) var(--s-4);
}

.alert__title {
    font-weight: 700;
}

.alert__msg {
    margin-top: 4px;
}

.muted {
    margin: 0;
    color: var(--text-2);
}

@media (max-width: 960px) {
    .approvals-page__hero {
        flex-direction: column;
        align-items: flex-start;
        padding: var(--s-4);
    }
}
</style>
