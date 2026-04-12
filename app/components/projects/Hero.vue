<script setup lang="ts">
defineProps<{
    breadcrumb?: string
    title?: string
    subtitle?: string
    metrics?: Array<{ label: string; value: string | number }>
    canCreate: boolean
    createOpen: boolean
    createLabel?: string
    closeLabel?: string
}>()

defineEmits<{
    (e: "toggle-create"): void
}>()
</script>

<template>
    <header class="projects-hero card">
        <div class="projects-hero__copy">
            <p class="projects-hero__breadcrumb">{{ breadcrumb ?? "Management / Projects" }}</p>
            <h1 class="projects-hero__title">{{ title ?? "Active Projects" }}</h1>
            <p class="projects-hero__subtitle">
                {{
                    subtitle ??
                    "Create projects, keep ownership clear, and manage team assignments without leaving the workspace."
                }}
            </p>
        </div>

        <div class="projects-hero__aside">
            <div class="projects-hero__metrics">
                <div v-for="metric in metrics ?? []" :key="metric.label" class="projects-hero__metric">
                    <span>{{ metric.label }}</span>
                    <strong>{{ metric.value }}</strong>
                </div>
            </div>

            <button
                v-if="canCreate"
                type="button"
                class="btn btn-primary projects-hero__cta"
                :aria-expanded="createOpen"
                @click="$emit('toggle-create')"
            >
                {{ createOpen ? closeLabel ?? "Close project form" : createLabel ?? "Create New Project" }}
            </button>
        </div>
    </header>
</template>

<style scoped>
.projects-hero {
    display: flex;
    justify-content: space-between;
    gap: var(--s-4);
    padding: var(--s-5);
}

.projects-hero__copy {
    max-width: 720px;
}

.projects-hero__breadcrumb {
    margin: 0 0 var(--s-1);
    color: var(--text-3);
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.projects-hero__title {
    margin: 0;
    font-size: clamp(1.55rem, 2.8vw, 2.2rem);
}

.projects-hero__subtitle {
    margin: var(--s-2) 0 0;
    color: var(--text-2);
    max-width: 62ch;
}

.projects-hero__aside {
    display: grid;
    gap: var(--s-3);
    min-width: min(100%, 320px);
}

.projects-hero__metrics {
    display: flex;
    gap: var(--s-3);
    flex-wrap: wrap;
    justify-content: flex-end;
}

.projects-hero__metric {
    min-width: 120px;
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%);
}

.projects-hero__metric span {
    display: block;
    margin-bottom: 6px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    font-weight: 700;
}

.projects-hero__metric strong {
    font-size: 1.25rem;
}

.projects-hero__cta {
    justify-self: end;
    min-width: 220px;
}

@media (max-width: 980px) {
    .projects-hero {
        flex-direction: column;
        padding: var(--s-4);
    }

    .projects-hero__metrics {
        justify-content: flex-start;
    }

    .projects-hero__cta {
        justify-self: start;
    }
}
</style>
