<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

import { computed, onMounted, ref } from "vue"
import { organizationsApi, type Organization, type OrganizationMember } from "~/api/organizationsApi"
import { timesheetsApi, type Timesheet } from "~/api/timesheetsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"
import { useAuth } from "~/composables/useAuth"

type ApprovalRow = Timesheet & {
    isApproving?: boolean
    isRejecting?: boolean
    rejectReason?: string
    error?: UiError | null
}

const org = ref<Organization | null>(null)
const approvals = ref<ApprovalRow[]>([])
const members = ref<OrganizationMember[]>([])
const loading = ref(true)
const error = ref<UiError | null>(null)
const mySubmissions = ref<Timesheet[]>([])

const { user } = useAuth()

const memberMap = computed(() => {
    const map = new Map<string, OrganizationMember>()
    for (const m of members.value) map.set(m.userId, m)
    return map
})

const myMember = computed(() => {
    if (!user.value?.userId) return null
    return members.value.find((m) => m.userId === user.value?.userId) ?? null
})

const isManagerOrAdmin = computed(() => {
    if (!myMember.value) return false
    return myMember.value.role === 0 || myMember.value.role === 1
})

function displayName(userId?: string) {
    if (!userId) return "Unknown member"
    const member = memberMap.value.get(userId)
    if (!member) return userId
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()
    return name || member.userId
}

function formatDate(date?: string) {
    if (!date) return "—"
    const [y, m, d] = date.split("-")
    if (!y || !m || !d) return date
    return `${y}-${m}-${d}`
}

function formatMinutes(total?: number) {
    if (!total && total !== 0) return "—"
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    return `${hours}h ${minutes}m`
}

function statusLabel(status?: number) {
    if (status === 1) return "Submitted"
    if (status === 2) return "Approved"
    if (status === 3) return "Rejected"
    return "Draft"
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
        org.value = orgs[0]
        if (!org.value?.id) return
        const [membersResult, approvalsResult, mineResult] = await Promise.all([
            organizationsApi.getMembers(org.value.id),
            timesheetsApi.listPendingApproval(org.value.id),
            timesheetsApi.listMine(org.value.id),
        ])
        members.value = membersResult
        approvals.value = approvalsResult.map((t) => ({
            ...t,
            rejectReason: "",
            error: null,
        }))
        mySubmissions.value = mineResult.filter((t) => t.status !== undefined && t.status !== 0)
    } catch (e) {
        console.error("Load approvals error:", e)
        error.value = toUiError(e)
    } finally {
        loading.value = false
    }
}

async function approveTimesheet(row: ApprovalRow) {
    if (!org.value?.id) return
    row.error = null
    row.isApproving = true
    try {
        await timesheetsApi.approve(org.value.id, row.id)
        approvals.value = approvals.value.filter((t) => t.id !== row.id)
    } catch (e) {
        console.error("Approve timesheet error:", e)
        row.error = toUiError(e)
    } finally {
        row.isApproving = false
    }
}

async function rejectTimesheet(row: ApprovalRow) {
    if (!org.value?.id) return
    row.error = null
    if (!row.rejectReason?.trim()) {
        row.error = {
            title: "Reason required",
            message: "Please provide a reason to reject this timesheet.",
        }
        return
    }
    row.isRejecting = true
    try {
        await timesheetsApi.reject(org.value.id, row.id, { reason: row.rejectReason.trim() })
        approvals.value = approvals.value.filter((t) => t.id !== row.id)
    } catch (e) {
        console.error("Reject timesheet error:", e)
        row.error = toUiError(e)
    } finally {
        row.isRejecting = false
    }
}

onMounted(loadApprovals)
</script>

<template>
    <section class="card approvals">
        <header class="approvals__header">
            <div>
                <h1 class="approvals__title">Approvals</h1>
                <p v-if="org" class="approvals__subtitle">{{ org.name }}</p>
            </div>
            <div class="approvals__meta">
                <span class="approvals__meta-label">
                    {{ isManagerOrAdmin ? "Pending" : "My submissions" }}
                </span>
                <span class="approvals__meta-value">
                    {{ isManagerOrAdmin ? approvals.length : mySubmissions.length }}
                </span>
            </div>
        </header>

        <div v-if="error" class="alert" role="alert">
            <div class="alert__title">{{ error.title }}</div>
            <div class="alert__msg">{{ error.message }}</div>
        </div>

        <template v-else-if="loading">
            <p class="muted">Loading approvals…</p>
        </template>

        <template v-else>
            <div class="approvals__table-wrap">
                <table class="approvals-table" v-if="isManagerOrAdmin && approvals.length">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Week</th>
                            <th>Total</th>
                            <th>Submitted</th>
                            <th class="approvals-table__actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in approvals" :key="row.id">
                            <td>
                                <div class="approvals__employee">
                                    <span class="approvals__employee-name">
                                        {{ displayName(row.userId as string) }}
                                    </span>
                                    <span class="approvals__employee-id">ID: {{ row.userId }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="approvals__week">
                                    <span>{{ formatDate(row.weekStartDate) }}</span>
                                    <span class="approvals__week-sep">→</span>
                                    <span>{{ formatDate(row.weekEndDate) }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="approvals__total">
                                    <span class="approvals__total-hours">
                                        {{ formatMinutes(row.totalMinutes as number) }}
                                    </span>
                                </div>
                            </td>
                            <td>{{ row.submittedAtUtc ? row.submittedAtUtc.slice(0, 10) : "—" }}</td>
                            <td class="approvals-table__actions">
                                <div class="approvals__row-actions">
                                    <button
                                        type="button"
                                        class="btn btn-primary btn-sm"
                                        :disabled="row.isApproving || row.isRejecting"
                                        @click="approveTimesheet(row)"
                                    >
                                        {{ row.isApproving ? "Approving…" : "Approve" }}
                                    </button>
                                    <button
                                        type="button"
                                        class="btn btn-secondary btn-sm"
                                        :disabled="row.isRejecting || row.isApproving"
                                        @click="rejectTimesheet(row)"
                                    >
                                        {{ row.isRejecting ? "Rejecting…" : "Reject" }}
                                    </button>
                                </div>
                                <div class="approvals__reject">
                                    <input
                                        v-model="row.rejectReason"
                                        type="text"
                                        class="table-input"
                                        placeholder="Rejection reason"
                                        :disabled="row.isApproving || row.isRejecting"
                                    />
                                </div>
                                <div v-if="row.error" class="alert alert--inline">
                                    {{ row.error.message }}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <table class="approvals-table" v-else-if="!isManagerOrAdmin && mySubmissions.length">
                    <thead>
                        <tr>
                            <th>Week</th>
                            <th>Status</th>
                            <th>Total</th>
                            <th>Submitted</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in mySubmissions" :key="row.id">
                            <td>
                                <div class="approvals__week">
                                    <span>{{ formatDate(row.weekStartDate) }}</span>
                                    <span class="approvals__week-sep">→</span>
                                    <span>{{ formatDate(row.weekEndDate) }}</span>
                                </div>
                            </td>
                            <td>{{ statusLabel(row.status) }}</td>
                            <td>{{ formatMinutes(row.totalMinutes) }}</td>
                            <td>{{ row.submittedAtUtc ? row.submittedAtUtc.slice(0, 10) : "—" }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="muted">
                    {{ isManagerOrAdmin ? "No pending approvals." : "No submissions yet." }}
                </p>
            </div>
        </template>
    </section>
</template>

<style scoped>
.approvals {
    padding: var(--s-5);
}

.approvals__header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
}

.approvals__title {
    margin: 0 0 var(--s-1) 0;
    font-size: 1.5rem;
}

.approvals__subtitle {
    margin: 0;
    color: var(--text-2);
    font-size: 0.95rem;
}

.approvals__meta {
    text-align: right;
}

.approvals__meta-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
}

.approvals__meta-value {
    display: block;
    font-weight: 600;
    font-size: 1.1rem;
}

.approvals__table-wrap {
    overflow-x: auto;
}

.approvals-table {
    width: 100%;
    border-collapse: collapse;
}

.approvals-table th,
.approvals-table td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
}

.approvals-table th {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
}

.approvals-table__actions {
    width: 280px;
}

.approvals__employee {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.approvals__employee-name {
    font-weight: 600;
}

.approvals__employee-id {
    color: var(--text-3);
    font-size: 0.75rem;
}

.approvals__week {
    display: flex;
    align-items: center;
    gap: var(--s-1);
    font-weight: 600;
}

.approvals__week-sep {
    color: var(--text-3);
}

.approvals__total-hours {
    font-weight: 600;
}

.approvals__row-actions {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.approvals__reject {
    margin-top: var(--s-2);
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
