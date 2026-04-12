<script setup lang="ts">
import { computed } from "vue"
import type { Project } from "~/api/projectsApi"

const props = withDefaults(
    defineProps<{
        modelValue: string
        projects: Project[]
        disabled?: boolean
        canCreateProject?: boolean
        source: "track" | "timesheets"
        returnTo?: string
        compact?: boolean
        placeholder?: string
    }>(),
    {
        disabled: false,
        canCreateProject: false,
        returnTo: "/projects",
        compact: false,
        placeholder: "Select project",
    }
)

const emit = defineEmits<{
    "update:modelValue": [value: string]
}>()

const hasProjects = computed(() => props.projects.length > 0)
const helperTitle = computed(() =>
    props.source === "track" ? "Create a project before tracking time" : "Create a project before logging time"
)
const helperMessage = computed(() =>
    props.canCreateProject
        ? "This organization does not have any projects yet. Add one in Projects, then come back and continue."
        : "This organization does not have any projects yet. Ask a manager or admin to create one before continuing."
)
const ctaLabel = computed(() =>
    props.source === "track" ? "Create project to start timer" : "Create project to add timesheet rows"
)

function updateValue(event: Event) {
    emit("update:modelValue", (event.target as HTMLSelectElement).value)
}

function openCreateProject() {
    return navigateTo({
        path: "/projects",
        query: {
            create: "1",
            returnTo: props.returnTo,
        },
    })
}
</script>

<template>
    <select v-if="hasProjects" :value="modelValue" :disabled="disabled" @change="updateValue">
        <option value="">{{ placeholder }}</option>
        <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.name }}
        </option>
    </select>

    <div
        v-else
        class="project-guide"
        :class="{
            'project-guide--compact': compact,
            'project-guide--actionable': canCreateProject,
        }"
        role="status"
        aria-live="polite"
    >
        <div class="project-guide__orb" aria-hidden="true" />
        <div class="project-guide__copy">
            <strong class="project-guide__title">{{ helperTitle }}</strong>
            <p class="project-guide__message">{{ helperMessage }}</p>
        </div>
        <button
            v-if="canCreateProject"
            type="button"
            class="btn btn-primary project-guide__cta"
            @click="openCreateProject"
        >
            {{ ctaLabel }}
        </button>
    </div>
</template>

<style scoped>
.project-guide {
    position: relative;
    display: grid;
    gap: var(--s-3);
    padding: var(--s-4);
    border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
    border-radius: var(--r-md);
    background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 34%),
        linear-gradient(135deg, #ffffff 0%, #f4fbfa 100%);
    overflow: hidden;
}

.project-guide--compact {
    padding: var(--s-3);
}

.project-guide__orb {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), var(--primary));
    box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.25);
    animation: project-guide-pulse 1.9s ease-in-out infinite;
}

.project-guide__copy {
    display: grid;
    gap: var(--s-1);
}

.project-guide__title {
    font-size: 0.95rem;
}

.project-guide__message {
    margin: 0;
    color: var(--text-2);
    line-height: 1.5;
}

.project-guide__cta {
    justify-self: start;
    position: relative;
    overflow: hidden;
}

.project-guide__cta::after {
    content: "";
    position: absolute;
    inset: 0 auto 0 -120%;
    width: 70%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
    transform: skewX(-18deg);
    animation: project-guide-sheen 2.8s ease-in-out infinite;
}

.project-guide--compact .project-guide__title {
    font-size: 0.875rem;
}

.project-guide--compact .project-guide__message {
    font-size: 0.875rem;
}

@keyframes project-guide-pulse {
    0%,
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.18);
    }
    50% {
        transform: scale(1.08);
        box-shadow: 0 0 0 10px rgba(15, 118, 110, 0);
    }
}

@keyframes project-guide-sheen {
    0%,
    65%,
    100% {
        left: -120%;
    }
    80% {
        left: 140%;
    }
}

@media (prefers-reduced-motion: reduce) {
    .project-guide__orb,
    .project-guide__cta::after {
        animation: none;
    }
}
</style>
