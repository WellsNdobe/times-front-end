<script setup lang="ts">
type ProjectDraft = {
    name: string
    clientId: string
    isActive: boolean
}

const props = defineProps<{
    modelValue: ProjectDraft
    clients: Array<{ value: string; label: string }>
    loading: boolean
    errorMessage?: string | null
}>()

const emit = defineEmits<{
    (e: "update:modelValue", value: ProjectDraft): void
    (e: "submit"): void
    (e: "cancel"): void
}>()

function updateField<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    emit("update:modelValue", {
        ...props.modelValue,
        [key]: value,
    })
}
</script>

<template>
    <section class="projects-create card">
        <div class="projects-create__head">
            <div>
                <p class="projects-create__eyebrow">Project Setup</p>
                <h2 class="projects-create__title">Create a new project</h2>
                <p class="projects-create__subtitle">
                    Start with a clear name and client, then assign the right team and approvers after creation.
                </p>
            </div>
            <button type="button" class="btn btn-secondary" @click="$emit('cancel')">
                Close
            </button>
        </div>

        <form class="projects-create__form" @submit.prevent="$emit('submit')">
            <label class="projects-create__field projects-create__field--wide">
                <span class="projects-create__label">Project name</span>
                <input
                    :value="modelValue.name"
                    type="text"
                    required
                    placeholder="Security Audit & Patching"
                    autocomplete="off"
                    @input="updateField('name', ($event.target as HTMLInputElement).value)"
                />
            </label>

            <label class="projects-create__field">
                <span class="projects-create__label">Client</span>
                <select
                    :value="modelValue.clientId"
                    @change="updateField('clientId', ($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="client in clients" :key="client.value" :value="client.value">
                        {{ client.label }}
                    </option>
                </select>
            </label>

            <label class="projects-create__field projects-create__field--toggle">
                <span class="projects-create__label">Status</span>
                <button
                    type="button"
                    class="projects-create__toggle"
                    :class="{ 'projects-create__toggle--active': modelValue.isActive }"
                    @click="updateField('isActive', !modelValue.isActive)"
                >
                    <span>{{ modelValue.isActive ? "Active" : "Archived" }}</span>
                </button>
            </label>
        </form>

        <div v-if="errorMessage" class="alert alert--inline" role="alert">
            {{ errorMessage }}
        </div>

        <div class="projects-create__actions">
            <button type="button" class="btn btn-secondary" @click="$emit('cancel')">
                Cancel
            </button>
            <button type="button" class="btn btn-primary" :disabled="loading" @click="$emit('submit')">
                {{ loading ? "Creating..." : "Create Project" }}
            </button>
        </div>
    </section>
</template>

<style scoped>
.projects-create {
    display: grid;
    gap: var(--s-4);
    padding: var(--s-5);
}

.projects-create__head {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
}

.projects-create__eyebrow {
    margin: 0 0 var(--s-1);
    color: var(--text-3);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.projects-create__title {
    margin: 0;
    font-size: 1.35rem;
}

.projects-create__subtitle {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
    max-width: 60ch;
}

.projects-create__form {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(220px, 1fr) 160px;
    gap: var(--s-3);
}

.projects-create__field {
    display: grid;
    gap: 6px;
}

.projects-create__label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
}

.projects-create__toggle {
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: #f5f8fa;
    color: var(--text-2);
    font-weight: 700;
}

.projects-create__toggle--active {
    background: rgba(15, 118, 110, 0.12);
    color: var(--primary);
    border-color: rgba(15, 118, 110, 0.2);
}

.projects-create__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
}

.alert--inline {
    padding: var(--s-2) var(--s-3);
    border: 1px solid #f1c3c3;
    border-radius: var(--r-sm);
    background: #fff7f7;
    color: #8a1f1f;
    font-size: 0.82rem;
}

@media (max-width: 960px) {
    .projects-create {
        padding: var(--s-4);
    }

    .projects-create__head {
        flex-direction: column;
        align-items: flex-start;
    }

    .projects-create__form {
        grid-template-columns: 1fr;
    }
}
</style>
