<script setup lang="ts">
defineProps<{
    query: string
    clientId: string
    status: string
    clients: Array<{ value: string; label: string }>
    loading: boolean
}>()

defineEmits<{
    (e: "update:query", value: string): void
    (e: "update:clientId", value: string): void
    (e: "update:status", value: string): void
    (e: "apply"): void
    (e: "reset"): void
}>()
</script>

<template>
    <section class="projects-filter-bar card" aria-label="Projects filters">
        <div class="projects-filter-bar__fields">
            <label class="projects-filter-field projects-filter-field--search">
                <span class="projects-filter-field__label">Search</span>
                <input
                    :value="query"
                    type="search"
                    placeholder="Search by project name or client..."
                    @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
                />
            </label>

            <label class="projects-filter-field">
                <span class="projects-filter-field__label">Client</span>
                <select
                    :value="clientId"
                    @change="$emit('update:clientId', ($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="client in clients" :key="client.value" :value="client.value">
                        {{ client.label }}
                    </option>
                </select>
            </label>

            <label class="projects-filter-field">
                <span class="projects-filter-field__label">Status</span>
                <select
                    :value="status"
                    @change="$emit('update:status', ($event.target as HTMLSelectElement).value)"
                >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="all">All statuses</option>
                </select>
            </label>
        </div>

        <div class="projects-filter-bar__actions">
            <button type="button" class="btn btn-secondary" :disabled="loading" @click="$emit('reset')">
                Reset
            </button>
            <button type="button" class="btn btn-primary" :disabled="loading" @click="$emit('apply')">
                {{ loading ? "Applying..." : "Apply Filters" }}
            </button>
        </div>
    </section>
</template>

<style scoped>
.projects-filter-bar {
    padding: var(--s-4);
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-4);
}

.projects-filter-bar__fields {
    display: grid;
    grid-template-columns: minmax(260px, 1.8fr) repeat(2, minmax(180px, 1fr));
    gap: var(--s-3);
    flex: 1 1 auto;
}

.projects-filter-field {
    display: grid;
    gap: 6px;
    min-width: 0;
}

.projects-filter-field__label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
}

.projects-filter-bar__actions {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
}

@media (max-width: 1100px) {
    .projects-filter-bar {
        flex-direction: column;
        align-items: stretch;
    }

    .projects-filter-bar__fields {
        grid-template-columns: 1fr;
    }
}
</style>
