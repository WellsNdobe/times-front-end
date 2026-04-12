<script setup lang="ts">
defineProps<{
    title: string
    loading: boolean
    error?: string | null
    items: Array<{ id: string; label: string }>
    emptyText: string
    canManage: boolean
    manageHint: string
    selectLabel: string
    selectedUserId: string
    candidates: Array<{ value: string; label: string }>
    addBusy: boolean
    removeBusyId?: string | null
}>()

defineEmits<{
    (e: "refresh"): void
    (e: "update:selectedUserId", value: string): void
    (e: "add"): void
    (e: "remove", userId: string): void
}>()
</script>

<template>
    <div class="member-panel">
        <div class="member-panel__head">
            <strong>{{ title }}</strong>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="$emit('refresh')">
                Refresh
            </button>
        </div>

        <div v-if="error" class="alert alert--inline" role="alert">{{ error }}</div>
        <p v-else-if="loading" class="member-panel__muted">Loading...</p>

        <ul v-else-if="items.length" class="member-panel__list">
            <li v-for="item in items" :key="item.id" class="member-panel__item">
                <span class="member-panel__name">{{ item.label }}</span>
                <button
                    v-if="canManage"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="removeBusyId === item.id"
                    @click="$emit('remove', item.id)"
                >
                    {{ removeBusyId === item.id ? "Removing..." : "Remove" }}
                </button>
            </li>
        </ul>

        <p v-else class="member-panel__muted">{{ emptyText }}</p>

        <div v-if="canManage" class="member-panel__add">
            <label class="member-panel__field">
                <span class="member-panel__field-label">{{ selectLabel }}</span>
                <select
                    :value="selectedUserId"
                    :disabled="addBusy || !candidates.length"
                    @change="$emit('update:selectedUserId', ($event.target as HTMLSelectElement).value)"
                >
                    <option value="">Select a member...</option>
                    <option v-for="candidate in candidates" :key="candidate.value" :value="candidate.value">
                        {{ candidate.label }}
                    </option>
                </select>
            </label>
            <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="addBusy || !candidates.length"
                @click="$emit('add')"
            >
                {{ addBusy ? "Saving..." : "Add" }}
            </button>
        </div>

        <p v-else class="member-panel__muted">{{ manageHint }}</p>
    </div>
</template>

<style scoped>
.member-panel {
    display: grid;
    gap: var(--s-3);
}

.member-panel__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
}

.member-panel__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--s-2);
}

.member-panel__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: #fbfcfe;
}

.member-panel__name {
    font-weight: 600;
    color: var(--text-1);
}

.member-panel__muted {
    margin: 0;
    color: var(--text-2);
}

.member-panel__add {
    display: flex;
    gap: var(--s-3);
    align-items: end;
}

.member-panel__field {
    display: grid;
    gap: 6px;
    min-width: min(100%, 320px);
    flex: 1 1 auto;
}

.member-panel__field-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
}

.alert--inline {
    padding: var(--s-2) var(--s-3);
    border: 1px solid #f1c3c3;
    border-radius: var(--r-sm);
    background: #fff7f7;
    color: #8a1f1f;
    font-size: 0.82rem;
}

@media (max-width: 720px) {
    .member-panel__item,
    .member-panel__add,
    .member-panel__head {
        flex-direction: column;
        align-items: flex-start;
    }

    .member-panel__field {
        min-width: 0;
        width: 100%;
    }
}
</style>
