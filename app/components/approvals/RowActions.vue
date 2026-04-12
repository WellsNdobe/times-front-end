<script setup lang="ts">
defineProps<{
    rowId: string
    isPending: boolean
    isExpanded: boolean
    isApproving: boolean
    isRejecting: boolean
    rejectOpen: boolean
    rejectReason: string
    recentlyApproved: boolean
    disabled?: boolean
}>()

defineEmits<{
    (e: "approve", rowId: string): void
    (e: "toggle-reject", rowId: string): void
    (e: "confirm-reject", rowId: string): void
    (e: "update-reject-reason", payload: { rowId: string; value: string }): void
    (e: "toggle-details", rowId: string): void
}>()
</script>

<template>
    <div class="row-actions">
        <div class="row-actions__buttons">
            <button
                type="button"
                class="row-actions__icon row-actions__icon--approve"
                :disabled="disabled || !isPending || isApproving || isRejecting"
                :aria-label="recentlyApproved ? 'Timesheet already approved' : 'Approve timesheet'"
                @click="$emit('approve', rowId)"
            >
                <Icon :name="isApproving ? 'mdi:loading' : 'mdi:check-circle'" size="18" :class="{ 'row-actions__spin': isApproving }" />
            </button>

            <button
                type="button"
                class="row-actions__icon row-actions__icon--reject"
                :disabled="disabled || !isPending || isApproving || isRejecting"
                aria-label="Reject timesheet"
                @click="$emit('toggle-reject', rowId)"
            >
                <Icon name="mdi:close-circle" size="18" />
            </button>

            <button
                type="button"
                class="row-actions__details"
                :aria-expanded="isExpanded"
                @click="$emit('toggle-details', rowId)"
            >
                {{ isExpanded ? "Hide details" : "Details" }}
            </button>
        </div>

        <div v-if="rejectOpen" class="row-actions__reject-panel">
            <input
                :value="rejectReason"
                type="text"
                placeholder="Reason for rejection"
                :disabled="isRejecting"
                @input="$emit('update-reject-reason', { rowId, value: ($event.target as HTMLInputElement).value })"
            />
            <button
                type="button"
                class="btn btn-secondary row-actions__reject-submit"
                :disabled="isRejecting"
                @click="$emit('confirm-reject', rowId)"
            >
                {{ isRejecting ? "Rejecting..." : "Confirm" }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.row-actions {
    display: grid;
    gap: var(--s-2);
    justify-items: end;
}

.row-actions__buttons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.row-actions__icon {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.row-actions__icon:hover:not(:disabled),
.row-actions__details:hover {
    background: var(--surface-2);
}

.row-actions__icon:focus-visible,
.row-actions__details:focus-visible,
.row-actions__reject-submit:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px var(--focus-soft);
}

.row-actions__icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.row-actions__icon--approve {
    color: var(--success);
}

.row-actions__icon--reject {
    color: var(--text-3);
}

.row-actions__details {
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
    color: var(--primary);
    font-weight: 600;
    cursor: pointer;
}

.row-actions__reject-panel {
    width: min(230px, 100%);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-2);
}

.row-actions__reject-submit {
    white-space: nowrap;
}

.row-actions__spin {
    animation: approvals-spin 1s linear infinite;
}

@keyframes approvals-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
    .row-actions,
    .row-actions__buttons {
        justify-items: start;
        justify-content: flex-start;
    }
}
</style>
