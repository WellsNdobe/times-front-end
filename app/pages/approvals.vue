<script setup lang="ts">
definePageMeta({ middleware: ["auth"] })

import { computed, onMounted, ref, watch } from "vue"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { projectsApi, type Project } from "~/api/projectsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { timesheetEntriesApi, type TimesheetEntry } from "~/api/timesheetEntriesApi"
import { toUiError, type UiError } from "~/utils/errorMessages"
import { useAuth } from "~/composables/useAuth"

type ApprovalRow = Timesheet & {
    isApproving?: boolean
    isRejecting?: boolean
    isExpanded?: boolean
    isRejectPanelOpen?: boolean
    rejectReason?: string
    entries?: TimesheetEntry[]
    entriesLoading?: boolean
    entriesError?: UiError | null
    error?: UiError | null
    activityNote?: string
}

const org = ref<Organization | null>(null)
const approvals = ref<ApprovalRow[]>([])
const members = ref<OrganizationMember[]>([])
const projects = ref<Project[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)
const selectedIds = ref<string[]>([])
const employeeFilter = ref("all")
const statusFilter = ref("all")
const dateMode = ref<"week" | "custom">("week")
const currentWeekStart = computed(() => formatDateForInput(getWeekStart(new Date())))
const weekStartDate = ref(currentWeekStart.value)
const weekLabel = computed(() => `Week of ${weekStartDate.value}`)
const isCurrentWeek = computed(() => weekStartDate.value === currentWeekStart.value)
const customFromDate = ref("")
const customToDate = ref("")

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

const myMember = computed(() => {
    if (!user.value?.userId) return null
    return members.value.find((member) => member.userId === user.value?.userId) ?? null
})

const isProjectApprover = computed(() => {
    const userId = user.value?.userId
    if (!userId) return false
    return projects.value.some((project) => (project.approverUserIds as string[] | undefined)?.includes(userId))
})

const canReviewApprovals = computed(() => {
    const role = myMember.value?.role
    return role === 0 || role === 1 || isProjectApprover.value || approvals.value.length > 0
})

const employeeOptions = computed(() => {
    const seen = new Set<string>()
    return approvals.value
        .map((row) => ({ id: row.userId as string, name: displayName(row.userId as string) }))
        .filter((option) => {
            if (!option.id || seen.has(option.id)) return false
            seen.add(option.id)
            return true
        })
        .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredApprovals = computed(() =>
    approvals.value.filter((row) => {
        const employeeMatch = employeeFilter.value === "all" || row.userId === employeeFilter.value
        const rowStatus = statusKey(row.status)
        const statusMatch = statusFilter.value === "all" || rowStatus === statusFilter.value
        return employeeMatch && statusMatch
    })
)

const pendingRows = computed(() => filteredApprovals.value.filter((row) => row.status === 1))
const selectedPendingRows = computed(() => pendingRows.value.filter((row) => selectedIds.value.includes(row.id)))
const allFilteredPendingSelected = computed(
    () => pendingRows.value.length > 0 && pendingRows.value.every((row) => selectedIds.value.includes(row.id))
)
const totalPendingHours = computed(() =>
    approvals.value
        .filter((row) => row.status === 1)
        .reduce((sum, row) => sum + minutesForRow(row), 0)
)
const filteredPendingCount = computed(() => pendingRows.value.length)

function minutesForRow(row: Timesheet) {
    if (typeof row.totalMinutes === "number") return row.totalMinutes
    if (typeof row.totalHours === "number") return Math.round(row.totalHours * 60)
    return 0
}

function displayName(userId?: string) {
    if (!userId) return "Unknown member"
    const member = memberMap.value.get(userId)
    if (!member) return "Unknown member"
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
    return name || "Unknown member"
}

function initialsFor(userId?: string) {
    const name = displayName(userId)
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
    return initials || "?"
}

function projectName(projectId?: string) {
    if (!projectId) return "Unknown project"
    return projectById.value.get(projectId)?.name ?? "Unknown project"
}

function parseDateForDisplay(value?: string) {
    if (!value) return null
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1])
        const month = Number(dateOnlyMatch[2])
        const day = Number(dateOnlyMatch[3])
        return new Date(year, month - 1, day)
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
}

function longDate(date?: string) {
    if (!date) return "—"
    const parsed = parseDateForDisplay(date)
    if (!parsed) return date
    return parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    })
}

function dayDate(date?: string) {
    if (!date) return "—"
    const parsed = parseDateForDisplay(date)
    if (!parsed) return date
    return parsed.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "2-digit",
    })
}

function formatPeriodLabel(start?: string, end?: string) {
    if (!start && !end) return "—"
    if (!start) return longDate(end)
    if (!end) return longDate(start)
    const startDate = parseDateForDisplay(start)
    const endDate = parseDateForDisplay(end)
    if (!startDate || !endDate) return `${start} - ${end}`
    const sameYear = startDate.getFullYear() === endDate.getFullYear()
    const startLabel = startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        ...(sameYear ? {} : { year: "numeric" }),
    })
    const endLabel = endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    })
    return `${startLabel} - ${endLabel}`
}

function formatHours(totalMinutes?: number, totalHours?: number) {
    if (typeof totalMinutes === "number") return `${(totalMinutes / 60).toFixed(1)} hrs`
    if (typeof totalHours === "number") return `${totalHours.toFixed(1)} hrs`
    return "0.0 hrs"
}

function statusKey(status?: number) {
    if (status === 2) return "approved"
    if (status === 3) return "rejected"
    if (status === 1) return "pending"
    return "draft"
}

function statusLabel(status?: number) {
    if (status === 2) return "Approved"
    if (status === 3) return "Rejected"
    if (status === 1) return "Pending"
    return "Draft"
}

function statusClass(status?: number) {
    if (status === 2) return "approval-badge--approved"
    if (status === 3) return "approval-badge--rejected"
    if (status === 1) return "approval-badge--pending"
    return "approval-badge--draft"
}

function isSelected(id: string) {
    return selectedIds.value.includes(id)
}

function toggleSelectAll() {
    if (allFilteredPendingSelected.value) {
        const pendingIds = new Set(pendingRows.value.map((row) => row.id))
        selectedIds.value = selectedIds.value.filter((id) => !pendingIds.has(id))
        return
    }
    const merged = new Set([...selectedIds.value, ...pendingRows.value.map((row) => row.id)])
    selectedIds.value = [...merged]
}

function toggleSelectRow(id: string) {
    if (isSelected(id)) {
        selectedIds.value = selectedIds.value.filter((value) => value !== id)
        return
    }
    selectedIds.value = [...selectedIds.value, id]
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
        const [membersResult, projectsResult] = await Promise.all([
            organizationsApi.getMembers(firstOrg.id),
            projectsApi.list(firstOrg.id),
        ])
        let approvalsResult: Timesheet[] = []
        const rangeParams =
            dateMode.value === "week"
                ? {
                    fromWeekStart: weekStartDate.value,
                    toWeekStart: weekStartDate.value,
                }
                : {
                    ...(customFromDate.value ? { fromWeekStart: customFromDate.value } : {}),
                    ...(customToDate.value ? { toWeekStart: customToDate.value } : {}),
                }
        try {
            approvalsResult = await timesheetsApi.listOrg(firstOrg.id, rangeParams)
        } catch (cause) {
            console.warn("Falling back to pending-approval list for approvals page:", cause)
            approvalsResult = await timesheetsApi.listPendingApproval(firstOrg.id, rangeParams)
        }
        members.value = membersResult
        projects.value = projectsResult
        approvals.value = approvalsResult
            .filter((timesheet) => {
                const status = timesheet.status
                return status === 1 || status === 2 || status === 3
            })
            .map((timesheet) => ({
                ...timesheet,
                status: timesheet.status ?? 1,
                rejectReason: "",
                isExpanded: false,
                isRejectPanelOpen: false,
                entries: undefined,
                entriesLoading: false,
                entriesError: null,
                error: null,
                activityNote: "",
            }))
        selectedIds.value = []
    } catch (cause) {
        console.error("Load approvals error:", cause)
        error.value = toUiError(cause)
    } finally {
        loading.value = false
    }
}

async function approveTimesheet(row: ApprovalRow) {
    if (!org.value?.id || row.isApproving || row.status !== 1) return
    row.error = null
    row.isApproving = true
    try {
        await timesheetsApi.approve(org.value.id, row.id)
        row.status = 2
        row.activityNote = "Approved just now"
        row.isRejectPanelOpen = false
        selectedIds.value = selectedIds.value.filter((id) => id !== row.id)
    } catch (cause) {
        console.error("Approve timesheet error:", cause)
        row.error = toUiError(cause)
    } finally {
        row.isApproving = false
    }
}

async function approveAllPending() {
    const rows = selectedPendingRows.value.length ? selectedPendingRows.value : pendingRows.value
    if (!rows.length) return
    await Promise.all(rows.map((row) => approveTimesheet(row)))
}

function openRejectPanel(row: ApprovalRow) {
    row.error = null
    row.isRejectPanelOpen = !row.isRejectPanelOpen
}

async function rejectTimesheet(row: ApprovalRow) {
    if (!org.value?.id || row.isRejecting || row.status !== 1) return
    row.error = null
    if (!row.rejectReason?.trim()) {
        row.error = {
            title: "Reason required",
            message: "Please enter a rejection reason before sending this back.",
        }
        row.isRejectPanelOpen = true
        return
    }
    row.isRejecting = true
    try {
        await timesheetsApi.reject(org.value.id, row.id, { reason: row.rejectReason.trim() })
        row.status = 3
        row.activityNote = "Rejected just now"
        row.isRejectPanelOpen = false
        selectedIds.value = selectedIds.value.filter((id) => id !== row.id)
    } catch (cause) {
        console.error("Reject timesheet error:", cause)
        row.error = toUiError(cause)
    } finally {
        row.isRejecting = false
    }
}

async function toggleDetails(row: ApprovalRow) {
    if (!org.value?.id) return
    row.isExpanded = !row.isExpanded
    if (!row.isExpanded || row.entriesLoading || row.entries) return

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

function moveWeek(offset: number) {
    const current = new Date(`${weekStartDate.value}T00:00:00`)
    if (Number.isNaN(current.getTime())) return
    current.setDate(current.getDate() + offset * 7)
    weekStartDate.value = formatDateForInput(getWeekStart(current))
}

function goToCurrentWeek() {
    if (isCurrentWeek.value) return
    weekStartDate.value = currentWeekStart.value
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

onMounted(loadApprovals)
watch([weekStartDate, dateMode, customFromDate, customToDate], () => {
    void loadApprovals()
})
</script>

<template>
    <section class="approvals-page">
        <div v-if="error" class="card approvals-page__alert alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <section class="card approvals-shell approvals-shell--loading">
                <p class="muted">Loading approvals…</p>
            </section>
        </template>

        <template v-else>
            <section class="card approvals-shell">
                <header class="approvals-shell__header">
                    <div>
                        <h1 class="approvals-shell__title">Pending Queue</h1>
                        <p class="approvals-shell__subtitle">
                            Review submitted timesheets and approve or send them back with feedback.
                        </p>
                    </div>
                    <button
                        v-if="canReviewApprovals"
                        type="button"
                        class="btn btn-primary approvals-shell__approve-all"
                        :disabled="!pendingRows.length"
                        @click="approveAllPending"
                    >
                        <Icon name="mdi:check-bold" />
                        {{ selectedPendingRows.length ? `Approve ${selectedPendingRows.length} Selected` : "Approve All Pending" }}
                    </button>
                </header>

                <div class="approvals-filters">
                    <label class="approvals-filter">
                        <span class="approvals-filter__label">Employee</span>
                        <select v-model="employeeFilter">
                            <option value="all">All Employees</option>
                            <option v-for="option in employeeOptions" :key="option.id" :value="option.id">
                                {{ option.name }}
                            </option>
                        </select>
                    </label>

                    <div class="approvals-filter approvals-filter--date">
                        <div class="approvals-filter__head">
                            <span class="approvals-filter__label">Date Range</span>
                            <div class="approvals-date-mode">
                                <button
                                    type="button"
                                    class="approvals-date-mode__btn"
                                    :class="{ 'approvals-date-mode__btn--active': dateMode === 'week' }"
                                    @click="dateMode = 'week'"
                                >
                                    Week
                                </button>
                                <button
                                    type="button"
                                    class="approvals-date-mode__btn"
                                    :class="{ 'approvals-date-mode__btn--active': dateMode === 'custom' }"
                                    @click="dateMode = 'custom'"
                                >
                                    Any to any
                                </button>
                            </div>
                        </div>

                        <div v-if="dateMode === 'week'" class="approvals-week-nav">
                            <button type="button" class="btn btn-secondary btn-sm" @click="moveWeek(-1)">Previous</button>
                            <span class="approvals-week-nav__label">{{ weekLabel }}</span>
                            <button type="button" class="btn btn-secondary btn-sm" :disabled="isCurrentWeek" @click="goToCurrentWeek">
                                This week
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm" @click="moveWeek(1)">Next</button>
                        </div>

                        <div v-else class="approvals-custom-range">
                            <label>
                                <span class="approvals-filter__label">From</span>
                                <input v-model="customFromDate" type="date" />
                            </label>
                            <label>
                                <span class="approvals-filter__label">To</span>
                                <input v-model="customToDate" type="date" />
                            </label>
                        </div>
                    </div>

                    <label class="approvals-filter approvals-filter--status">
                        <span class="approvals-filter__label">Status</span>
                        <select v-model="statusFilter">
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending Approval</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </label>
                </div>

                <div v-if="canReviewApprovals && filteredApprovals.length" class="approval-list">
                    <div class="approval-list__head approval-grid">
                        <label class="approval-list__check">
                            <input
                                type="checkbox"
                                :checked="allFilteredPendingSelected"
                                :disabled="!pendingRows.length"
                                @change="toggleSelectAll"
                            />
                        </label>
                        <span>Employee</span>
                        <span>Period</span>
                        <span>Total Hours</span>
                        <span>Status</span>
                        <span class="approval-list__actions-title">Actions</span>
                    </div>

                    <article
                        v-for="row in filteredApprovals"
                        :key="row.id"
                        class="approval-row"
                    >
                        <div class="approval-grid approval-row__summary">
                            <label class="approval-list__check">
                                <input
                                    type="checkbox"
                                    :checked="isSelected(row.id)"
                                    :disabled="row.status !== 1"
                                    @change="toggleSelectRow(row.id)"
                                />
                            </label>

                            <div class="approval-person">
                                <div class="approval-person__avatar">{{ initialsFor(row.userId as string) }}</div>
                                <div>
                                    <div class="approval-person__name">{{ displayName(row.userId as string) }}</div>
                                    <div class="approval-person__meta">
                                        Submitted {{ row.submittedAtUtc ? longDate(row.submittedAtUtc) : "recently" }}
                                    </div>
                                </div>
                            </div>

                            <div class="approval-period">
                                {{ formatPeriodLabel(row.weekStartDate, row.weekEndDate) }}
                            </div>

                            <div class="approval-hours">
                                {{ formatHours(row.totalMinutes, row.totalHours) }}
                            </div>

                            <div>
                                <span class="approval-badge" :class="statusClass(row.status)">
                                    {{ statusLabel(row.status) }}
                                </span>
                                <p v-if="row.activityNote" class="approval-activity">{{ row.activityNote }}</p>
                            </div>

                            <div class="approval-actions">
                                <template v-if="row.status === 1">
                                    <button
                                        type="button"
                                        class="approval-icon-btn approval-icon-btn--approve"
                                        :disabled="row.isApproving || row.isRejecting"
                                        @click="approveTimesheet(row)"
                                    >
                                        <Icon name="mdi:check" />
                                    </button>
                                    <button
                                        type="button"
                                        class="approval-icon-btn approval-icon-btn--reject"
                                        :disabled="row.isApproving || row.isRejecting"
                                        @click="openRejectPanel(row)"
                                    >
                                        <Icon name="mdi:close" />
                                    </button>
                                </template>
                                <button type="button" class="approval-details-btn" @click="toggleDetails(row)">
                                    {{ row.isExpanded ? "Hide" : "Details" }}
                                </button>
                            </div>
                        </div>

                        <div v-if="row.isRejectPanelOpen && row.status === 1" class="approval-row__reject-panel">
                            <label class="approval-reject">
                                <span class="approval-reject__label">Rejection reason</span>
                                <textarea
                                    v-model="row.rejectReason"
                                    rows="2"
                                    placeholder="Add context for the employee before rejecting this timesheet."
                                />
                            </label>
                            <div class="approval-reject__actions">
                                <button type="button" class="btn btn-secondary" @click="openRejectPanel(row)">
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    class="btn approval-reject__submit"
                                    :disabled="row.isRejecting || row.isApproving"
                                    @click="rejectTimesheet(row)"
                                >
                                    {{ row.isRejecting ? "Rejecting…" : "Reject timesheet" }}
                                </button>
                            </div>
                        </div>

                        <div v-if="row.error" class="alert alert--inline approval-row__error">
                            {{ row.error.message }}
                        </div>

                        <div v-if="row.isExpanded" class="approval-row__details">
                            <div class="approval-detail-card">
                                <div class="approval-detail-card__head approval-detail-grid">
                                    <span>Date</span>
                                    <span>Project</span>
                                    <span>Activity</span>
                                    <span>Hours</span>
                                </div>

                                <p v-if="row.entriesLoading" class="muted">Loading submitted rows…</p>
                                <div v-else-if="row.entriesError" class="alert alert--inline">
                                    {{ row.entriesError.message }}
                                </div>
                                <div v-else-if="row.entries?.length">
                                    <div
                                        v-for="entry in row.entries"
                                        :key="entry.id"
                                        class="approval-detail-grid approval-detail-card__row"
                                    >
                                        <span>{{ dayDate(entry.workDate) }}</span>
                                        <span>{{ projectName(entry.projectId) }}</span>
                                        <span>{{ entry.notes || "No notes provided" }}</span>
                                        <strong>{{ formatHours(entry.durationMinutes ?? 0) }}</strong>
                                    </div>
                                </div>
                                <p v-else class="muted">No submitted rows found for this timesheet.</p>
                            </div>
                        </div>
                    </article>
                </div>

                <div v-else-if="canReviewApprovals" class="approvals-empty">
                    <Icon name="mdi:clipboard-check-outline" />
                    <div>
                        <h2>No approvals match these filters</h2>
                        <p>Try changing the employee, week/range, or status filter.</p>
                    </div>
                </div>

                <div v-else class="approvals-empty">
                    <Icon name="mdi:account-lock-outline" />
                    <div>
                        <h2>Approvals are unavailable</h2>
                        <p>You need manager or approver access to review timesheets for {{ org?.name ?? "this organization" }}.</p>
                    </div>
                </div>

                <footer v-if="canReviewApprovals" class="approvals-shell__footer">
                    <p>
                        Showing {{ filteredPendingCount }} pending {{ filteredPendingCount === 1 ? "timesheet" : "timesheets" }}
                        for {{ employeeFilter === "all" ? "all employees" : displayName(employeeFilter) }}.
                    </p>
                    <p><strong>{{ (totalPendingHours / 60).toFixed(1) }}</strong> total hours pending approval</p>
                </footer>
            </section>
        </template>
    </section>
</template>

<style scoped>
.approvals-page {
    display: grid;
}

.approvals-page__alert {
    padding: var(--s-5);
}

.approvals-shell {
    border-radius: var(--r-lg);
    padding: var(--s-5);
    display: grid;
    gap: var(--s-4);
}

.approvals-shell--loading {
    min-height: 260px;
    place-items: center;
}

.approvals-shell__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-4);
    flex-wrap: wrap;
}

.approvals-shell__title {
    margin: 0;
    font-size: clamp(1.4rem, 3vw, 2rem);
    font-weight: 700;
}

.approvals-shell__subtitle {
    margin: var(--s-1) 0 0;
    color: var(--text-2);
    max-width: 620px;
    line-height: 1.4;
    font-size: 0.9rem;
}

.approvals-shell__approve-all {
    min-width: 220px;
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: none;
}

.approvals-shell__approve-all:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
}

.approvals-filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) minmax(220px, 0.9fr);
    gap: var(--s-4);
}

.approvals-filter {
    display: grid;
    gap: 10px;
}

.approvals-filter__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
}

.approvals-filter__label {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-2);
}

.approvals-filter select {
    min-height: 42px;
    padding: 0 14px;
    background: var(--surface);
}

.approvals-date-mode {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    overflow: hidden;
}

.approvals-date-mode__btn {
    border: 0;
    background: var(--surface);
    color: var(--text-2);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 6px 10px;
    cursor: pointer;
}

.approvals-date-mode__btn + .approvals-date-mode__btn {
    border-left: 1px solid var(--border);
}

.approvals-date-mode__btn--active {
    background: var(--primary-soft);
    color: var(--primary);
}

.approvals-week-nav {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.approvals-week-nav__label {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-1);
}

.approvals-custom-range {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-2);
}

.approvals-custom-range label {
    display: grid;
    gap: 6px;
}

.approval-list {
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    overflow: hidden;
    background: var(--surface);
}

.approval-grid,
.approval-detail-grid {
    display: grid;
    grid-template-columns: 44px minmax(230px, 1.55fr) minmax(190px, 1.1fr) minmax(130px, 0.85fr) minmax(130px, 0.8fr) minmax(170px, 0.95fr);
    gap: var(--s-3);
    align-items: center;
}

.approval-list__head {
    padding: var(--s-3) var(--s-4);
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-2);
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.approval-list__actions-title {
    justify-self: end;
}

.approval-list__check {
    display: flex;
    justify-content: center;
}

.approval-list__check input {
    width: 18px;
    height: 18px;
    accent-color: var(--primary);
}

.approval-row {
    border-bottom: 1px solid var(--border);
}

.approval-row:last-child {
    border-bottom: 0;
}

.approval-row__summary {
    padding: var(--s-3) var(--s-4);
}

.approval-person {
    display: flex;
    align-items: center;
    gap: 14px;
}

.approval-person__avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #fde7dc, #f4b67a);
    color: #8c4d17;
    font-weight: 700;
    letter-spacing: 0.03em;
}

.approval-person__name {
    font-size: 1rem;
    font-weight: 700;
}

.approval-person__meta,
.approval-activity {
    margin: 4px 0 0;
    color: var(--text-2);
    font-size: 0.875rem;
}

.approval-period,
.approval-hours {
    font-size: 0.95rem;
    color: var(--text-1);
}

.approval-hours {
    font-weight: 700;
    font-size: 1rem;
    color: var(--text-1);
}

.approval-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 92px;
    padding: 7px 14px;
    border-radius: var(--r-pill);
    font-size: 0.8rem;
    border: 1px solid transparent;
}

.approval-badge--pending {
    color: var(--warning);
    border-color: rgba(217, 119, 6, 0.2);
    background: var(--warning-soft);
}

.approval-badge--approved {
    color: #027a48;
    border-color: #b7ebcc;
    background: #ecfdf3;
}

.approval-badge--rejected {
    color: #b42318;
    border-color: #f5c2be;
    background: #fef3f2;
}

.approval-badge--draft {
    color: #475467;
    border-color: #d0d5dd;
    background: #f2f4f7;
}

.approval-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
}

.approval-icon-btn,
.approval-details-btn {
    border: 0;
    background: transparent;
    font: inherit;
}

.approval-icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    color: #fff;
    cursor: pointer;
}

.approval-icon-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.approval-icon-btn--approve {
    background: #98a2b3;
}

.approval-icon-btn--approve:hover:not(:disabled) {
    background: var(--primary);
}

.approval-icon-btn--reject {
    background: #98a2b3;
}

.approval-icon-btn--reject:hover:not(:disabled) {
    background: #b42318;
}

.approval-details-btn {
    color: var(--primary);
    font-weight: 700;
    cursor: pointer;
}

.approval-details-btn:hover {
    text-decoration: underline;
}

.approval-row__reject-panel,
.approval-row__details {
    padding: 0 24px 24px;
}

.approval-reject {
    display: grid;
    gap: var(--s-2);
}

.approval-reject__label {
    font-weight: 600;
    color: #344054;
}

.approval-reject textarea {
    resize: vertical;
    min-height: 84px;
}

.approval-reject__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-3);
    margin-top: var(--s-3);
}

.approval-reject__submit {
    background: #b42318;
    color: #fff;
}

.approval-row__error {
    margin: 0 24px 24px;
}

.approval-detail-card {
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    overflow: hidden;
    background: var(--surface);
}

.approval-detail-card__head,
.approval-detail-card__row {
    padding: var(--s-3) var(--s-4);
}

.approval-detail-card__head {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-2);
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.approval-detail-card__row {
    border-bottom: 1px solid var(--border);
    color: var(--text-1);
}

.approval-detail-card__row:last-child {
    border-bottom: 0;
}

.approval-detail-grid {
    grid-template-columns: minmax(150px, 1fr) minmax(180px, 1fr) minmax(240px, 1.4fr) minmax(90px, 0.5fr);
}

.approvals-empty {
    min-height: 260px;
    border: 1px dashed var(--border);
    border-radius: var(--r-md);
    display: grid;
    place-items: center;
    text-align: center;
    gap: var(--s-3);
    color: var(--text-2);
    padding: var(--s-6);
}

.approvals-empty :deep(svg) {
    font-size: 2.4rem;
    color: var(--primary);
}

.approvals-empty h2 {
    margin: 0 0 var(--s-2);
    color: var(--text-1);
}

.approvals-empty p,
.approvals-shell__footer p,
.muted {
    margin: 0;
}

.approvals-shell__footer {
    display: flex;
    justify-content: space-between;
    gap: var(--s-4);
    color: var(--text-2);
    font-size: 0.9rem;
    flex-wrap: wrap;
}

.alert--inline {
    padding: var(--s-3);
}

@media (max-width: 1200px) {
    .approval-grid {
        grid-template-columns: 34px minmax(220px, 1.4fr) minmax(180px, 1fr) minmax(120px, 0.8fr) minmax(120px, 0.8fr) minmax(150px, 0.9fr);
    }
}

@media (max-width: 960px) {
    .approvals-shell {
        padding: var(--s-5);
    }

    .approvals-filters,
    .approval-grid,
    .approval-detail-grid,
    .approvals-shell__footer {
        grid-template-columns: 1fr;
    }

    .approvals-custom-range {
        grid-template-columns: 1fr;
    }

    .approval-list__head {
        display: none;
    }

    .approval-row__summary {
        gap: var(--s-4);
    }

    .approval-list__check {
        justify-content: flex-start;
    }

    .approval-actions,
    .approval-reject__actions {
        justify-content: flex-start;
    }

    .approval-row__reject-panel,
    .approval-row__details {
        padding: 0 20px 20px;
    }
}
</style>
