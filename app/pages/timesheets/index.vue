<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })

import { onMounted } from "vue"
import { useTimesheets } from "~/composables/useTimesheets"

const {
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
} = useTimesheets()

onMounted(() => loadTimesheet())
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
                                    v-model.number="entry.durationMinutes"
                                    type="number"
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
