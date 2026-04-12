<script setup lang="ts">
defineProps<{
    employees: Array<{ value: string; label: string }>
    employeeId: string
    status: string
    dateFrom: string
    dateTo: string
    approveAllDisabled: boolean
    approveAllBusy: boolean
}>()

defineEmits<{
    (e: "update:employeeId", value: string): void
    (e: "update:status", value: string): void
    (e: "update:dateFrom", value: string): void
    (e: "update:dateTo", value: string): void
    (e: "approve-all"): void
}>()
</script>

<template>
    <section class="filter-bar card" aria-label="Approvals filters">
        <div class="filter-bar__fields">
            <label class="filter-field">
                <span class="filter-field__label">Employee</span>
                <select
                    :value="employeeId"
                    @change="$emit('update:employeeId', ($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="employee in employees" :key="employee.value" :value="employee.value">
                        {{ employee.label }}
                    </option>
                </select>
            </label>

            <fieldset class="filter-field filter-field--range">
                <legend class="filter-field__label">Date range</legend>
                <div class="filter-field__range-inputs">
                    <input
                        :value="dateFrom"
                        type="date"
                        aria-label="Approvals start date"
                        @input="$emit('update:dateFrom', ($event.target as HTMLInputElement).value)"
                    />
                    <span class="filter-field__range-separator" aria-hidden="true">to</span>
                    <input
                        :value="dateTo"
                        type="date"
                        aria-label="Approvals end date"
                        @input="$emit('update:dateTo', ($event.target as HTMLInputElement).value)"
                    />
                </div>
            </fieldset>

            <label class="filter-field">
                <span class="filter-field__label">Status</span>
                <select
                    :value="status"
                    @change="$emit('update:status', ($event.target as HTMLSelectElement).value)"
                >
                    <option value="pending">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="all">All statuses</option>
                </select>
            </label>
        </div>

        <button type="button" class="btn btn-primary filter-bar__cta" :disabled="approveAllDisabled" @click="$emit('approve-all')">
            <Icon v-if="!approveAllBusy" name="mdi:check" size="16" />
            <Icon v-else name="mdi:loading" size="16" class="filter-bar__spinner" />
            <span>{{ approveAllBusy ? "Approving..." : "Approve All Pending" }}</span>
        </button>
    </section>
</template>

<style scoped>
.filter-bar {
    padding: var(--s-4);
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-4);
}

.filter-bar__fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
    flex: 1 1 auto;
}

.filter-field {
    display: grid;
    gap: 6px;
    min-width: 0;
    border: 0;
    padding: 0;
    margin: 0;
}

.filter-field__label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
}

.filter-field--range {
    min-width: min(100%, 360px);
}

.filter-field__range-inputs {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--s-2);
}

.filter-field__range-separator {
    font-size: 0.875rem;
    color: var(--text-2);
}

.filter-bar__cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
    min-width: 200px;
}

.filter-bar__spinner {
    animation: approvals-spin 1s linear infinite;
}

@keyframes approvals-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
    .filter-bar {
        flex-direction: column;
        align-items: stretch;
    }

    .filter-bar__fields {
        grid-template-columns: 1fr;
    }

    .filter-field--range {
        min-width: 0;
    }
}

@media (max-width: 640px) {
    .filter-field__range-inputs {
        grid-template-columns: 1fr;
    }

    .filter-field__range-separator {
        display: none;
    }
}
</style>
