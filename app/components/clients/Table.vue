<script setup lang="ts">
type ClientRow = {
    id: string
    name: string
    meta: string
    statusLabel: string
    isArchived: boolean
    isSelected: boolean
}

defineProps<{
    rows: ClientRow[]
    allActiveSelected: boolean
}>()

defineEmits<{
    (e: "toggle-select-all", checked: boolean): void
    (e: "toggle-select", payload: { clientId: string; checked: boolean }): void
    (e: "archive", clientId: string): void
}>()
</script>

<template>
    <section class="clients-table card">
        <div class="clients-table__scroll">
            <table class="clients-table__table">
                <thead>
                    <tr>
                        <th class="clients-table__checkbox">
                            <input
                                type="checkbox"
                                :checked="allActiveSelected"
                                aria-label="Select all active clients"
                                @change="$emit('toggle-select-all', ($event.target as HTMLInputElement).checked)"
                            />
                        </th>
                        <th>Client Name</th>
                        <th>Status</th>
                        <th>Record</th>
                        <th class="clients-table__actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.id" class="clients-table__row">
                        <td class="clients-table__checkbox">
                            <input
                                type="checkbox"
                                :checked="row.isSelected"
                                :disabled="row.isArchived"
                                :aria-label="`Select ${row.name}`"
                                @change="$emit('toggle-select', { clientId: row.id, checked: ($event.target as HTMLInputElement).checked })"
                            />
                        </td>
                        <td>
                            <div class="clients-table__client">
                                <div class="clients-table__icon">{{ row.name.slice(0, 2).toUpperCase() }}</div>
                                <strong class="clients-table__name">{{ row.name }}</strong>
                            </div>
                        </td>
                        <td>
                            <span class="clients-table__status" :class="row.isArchived ? 'clients-table__status--archived' : 'clients-table__status--active'">
                                {{ row.statusLabel }}
                            </span>
                        </td>
                        <td>
                            <p class="clients-table__meta">{{ row.meta }}</p>
                        </td>
                        <td class="clients-table__actions">
                            <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                :disabled="row.isArchived"
                                @click="$emit('archive', row.id)"
                            >
                                {{ row.isArchived ? "Archived" : "Archive" }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>

<style scoped>
.clients-table {
    overflow: hidden;
}

.clients-table__scroll {
    overflow-x: auto;
}

.clients-table__table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}

.clients-table__table th,
.clients-table__table td {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
}

.clients-table__checkbox {
    width: 44px;
    text-align: center;
}

.clients-table__table th {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    background: #fbfcfe;
    white-space: nowrap;
}

.clients-table__row:hover td {
    background: #fcfdfd;
}

.clients-table__client {
    display: flex;
    align-items: center;
    gap: var(--s-3);
}

.clients-table__icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(15, 118, 110, 0.15) 0%, rgba(15, 118, 110, 0.05) 100%);
    color: var(--primary);
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.06em;
}

.clients-table__name {
    color: var(--text-1);
}

.clients-table__meta {
    margin: 0;
    color: var(--text-2);
    font-size: 0.82rem;
}

.clients-table__status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 88px;
    padding: 5px 12px;
    border-radius: var(--r-pill);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    border: 1px solid transparent;
}

.clients-table__status--active {
    color: #0f766e;
    background: rgba(16, 185, 129, 0.14);
    border-color: rgba(16, 185, 129, 0.18);
}

.clients-table__status--archived {
    color: #5b6676;
    background: #eef2f6;
    border-color: #d8e0e8;
}

.clients-table__actions {
    width: 140px;
}
</style>
