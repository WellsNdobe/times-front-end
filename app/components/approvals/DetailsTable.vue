<script setup lang="ts">
type EntryItem = {
    id: string
    workDate?: string
    projectName?: string
    activity?: string
    hoursText?: string
}

defineProps<{
    loading: boolean
    error?: string | null
    entries: EntryItem[]
}>()
</script>

<template>
    <div class="details-table">
        <p v-if="loading" class="details-table__muted">Loading entry breakdown...</p>
        <div v-else-if="error" class="alert alert--inline" role="alert">{{ error }}</div>
        <table v-else-if="entries.length" class="details-table__table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Project</th>
                    <th>Activity</th>
                    <th>Hours</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="entry in entries" :key="entry.id">
                    <td>{{ entry.workDate }}</td>
                    <td>{{ entry.projectName }}</td>
                    <td>{{ entry.activity }}</td>
                    <td>{{ entry.hoursText }}</td>
                </tr>
            </tbody>
        </table>
        <p v-else class="details-table__muted">No time entries were found for this timesheet.</p>
    </div>
</template>

<style scoped>
.details-table {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    overflow: hidden;
}

.details-table__table {
    width: 100%;
    border-collapse: collapse;
}

.details-table__table th,
.details-table__table td {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
}

.details-table__table th {
    background: #fbfcfe;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-3);
}

.details-table__table tr:last-child td {
    border-bottom: 0;
}

.details-table__muted {
    margin: 0;
    padding: var(--s-4);
    color: var(--text-2);
}

.alert--inline {
    margin: 0;
    padding: var(--s-4);
}
</style>
