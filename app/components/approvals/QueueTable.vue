<script setup lang="ts">
import AvatarNameCell from "~/components/approvals/AvatarNameCell.vue"
import DetailsTable from "~/components/approvals/DetailsTable.vue"
import RowActions from "~/components/approvals/RowActions.vue"
import StatusBadge from "~/components/approvals/StatusBadge.vue"

type QueueRow = {
    id: string
    employeeName: string
    employeeSubtitle?: string
    periodLabel: string
    totalHoursLabel: string
    statusLabel: string
    statusMeta?: string
    isPending: boolean
    isApproving: boolean
    isRejecting: boolean
    rejectOpen: boolean
    rejectReason: string
    isExpanded: boolean
    isSelected: boolean
    recentlyApproved: boolean
    entriesLoading: boolean
    entriesError?: string | null
    errorMessage?: string | null
    detailEntries: Array<{
        id: string
        workDate?: string
        projectName?: string
        activity?: string
        hoursText?: string
    }>
}

defineProps<{
    rows: QueueRow[]
    allPendingSelected: boolean
    summaryLabel: string
    summaryHours: string
}>()

defineEmits<{
    (e: "toggle-select-all", checked: boolean): void
    (e: "toggle-select", payload: { rowId: string; checked: boolean }): void
    (e: "approve", rowId: string): void
    (e: "toggle-reject", rowId: string): void
    (e: "confirm-reject", rowId: string): void
    (e: "update-reject-reason", payload: { rowId: string; value: string }): void
    (e: "toggle-details", rowId: string): void
}>()
</script>

<template>
    <section class="queue-table card">
        <div class="queue-table__scroll">
            <table class="queue-table__table">
                <thead>
                    <tr>
                        <th class="queue-table__checkbox">
                            <input
                                type="checkbox"
                                :checked="allPendingSelected"
                                aria-label="Select all pending approvals"
                                @change="$emit('toggle-select-all', ($event.target as HTMLInputElement).checked)"
                            />
                        </th>
                        <th>Employee</th>
                        <th>Period</th>
                        <th>Total Hours</th>
                        <th>Status</th>
                        <th class="queue-table__actions-heading">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="row in rows" :key="row.id">
                        <tr
                            class="queue-table__row"
                            :class="{
                                'queue-table__row--selected': row.isSelected,
                                'queue-table__row--approved': row.recentlyApproved,
                            }"
                        >
                            <td class="queue-table__checkbox">
                                <input
                                    type="checkbox"
                                    :checked="row.isSelected"
                                    :disabled="!row.isPending"
                                    :aria-label="`Select ${row.employeeName}`"
                                    @change="$emit('toggle-select', { rowId: row.id, checked: ($event.target as HTMLInputElement).checked })"
                                />
                            </td>
                            <td>
                                <AvatarNameCell :name="row.employeeName" :subtitle="row.employeeSubtitle" />
                            </td>
                            <td>
                                <div class="queue-table__period">{{ row.periodLabel }}</div>
                            </td>
                            <td>
                                <div class="queue-table__hours">{{ row.totalHoursLabel }}</div>
                            </td>
                            <td>
                                <div class="queue-table__status">
                                    <StatusBadge :status="row.statusLabel" />
                                    <span v-if="row.statusMeta" class="queue-table__status-meta">{{ row.statusMeta }}</span>
                                </div>
                            </td>
                            <td class="queue-table__actions-cell">
                                <RowActions
                                    :row-id="row.id"
                                    :is-pending="row.isPending"
                                    :is-expanded="row.isExpanded"
                                    :is-approving="row.isApproving"
                                    :is-rejecting="row.isRejecting"
                                    :reject-open="row.rejectOpen"
                                    :reject-reason="row.rejectReason"
                                    :recently-approved="row.recentlyApproved"
                                    @approve="$emit('approve', $event)"
                                    @toggle-reject="$emit('toggle-reject', $event)"
                                    @confirm-reject="$emit('confirm-reject', $event)"
                                    @update-reject-reason="$emit('update-reject-reason', $event)"
                                    @toggle-details="$emit('toggle-details', $event)"
                                />
                                <div v-if="row.errorMessage" class="alert alert--inline queue-table__row-error" role="alert">
                                    {{ row.errorMessage }}
                                </div>
                            </td>
                        </tr>
                        <tr v-if="row.isExpanded" class="queue-table__details-row">
                            <td></td>
                            <td colspan="5">
                                <div class="queue-table__details">
                                    <div class="queue-table__details-head">
                                        <div>
                                            <strong>Timesheet Breakdown</strong>
                                            <p>{{ row.periodLabel }}</p>
                                        </div>
                                        <StatusBadge :status="row.statusLabel" subtle />
                                    </div>
                                    <DetailsTable
                                        :loading="row.entriesLoading"
                                        :error="row.entriesError"
                                        :entries="row.detailEntries"
                                    />
                                </div>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>

        <footer class="queue-table__footer">
            <p>{{ summaryLabel }}</p>
            <p><strong>{{ summaryHours }}</strong> total hours pending approval</p>
        </footer>
    </section>
</template>

<style scoped>
.queue-table {
    overflow: hidden;
}

.queue-table__scroll {
    overflow-x: auto;
}

.queue-table__table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}

.queue-table__table th,
.queue-table__table td {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
}

.queue-table__table th {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    background: #fbfcfe;
    white-space: nowrap;
}

.queue-table__checkbox {
    width: 44px;
    text-align: center;
}

.queue-table__actions-heading,
.queue-table__actions-cell {
    width: 240px;
}

.queue-table__row {
    transition: background-color 180ms ease, box-shadow 180ms ease;
}

.queue-table__row--selected td {
    background: #f4fbfb;
}

.queue-table__row--approved td {
    background: linear-gradient(180deg, #fbfffc 0%, #f3fbf5 100%);
}

.queue-table__period {
    color: var(--text-2);
    font-weight: 500;
}

.queue-table__hours {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--text-1);
}

.queue-table__status {
    display: grid;
    gap: 6px;
    justify-items: start;
}

.queue-table__status-meta {
    font-size: 0.8rem;
    color: var(--success);
    font-weight: 600;
}

.queue-table__row-error {
    margin-top: var(--s-2);
    justify-self: end;
    max-width: 220px;
}

.alert--inline {
    padding: var(--s-2) var(--s-3);
    border: 1px solid #f1c3c3;
    border-radius: var(--r-sm);
    background: #fff7f7;
    color: #8a1f1f;
    font-size: 0.82rem;
}

.queue-table__details-row td {
    background: #fcfdfd;
}

.queue-table__details {
    display: grid;
    gap: var(--s-3);
    padding: var(--s-2) 0 var(--s-3);
}

.queue-table__details-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
}

.queue-table__details-head strong {
    display: block;
}

.queue-table__details-head p {
    margin: 4px 0 0;
    color: var(--text-2);
    font-size: 0.875rem;
}

.queue-table__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-4);
    color: var(--text-2);
}

.queue-table__footer p {
    margin: 0;
}

@media (max-width: 900px) {
    .queue-table__footer,
    .queue-table__details-head {
        flex-direction: column;
        align-items: flex-start;
    }

    .queue-table__actions-heading,
    .queue-table__actions-cell {
        width: 280px;
    }
}
</style>
