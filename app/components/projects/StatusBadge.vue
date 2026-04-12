<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
    active: boolean
}>()

const label = computed(() => (props.active ? "Active" : "Archived"))
</script>

<template>
    <span class="project-status" :class="active ? 'project-status--active' : 'project-status--archived'">
        {{ label }}
    </span>
</template>

<style scoped>
.project-status {
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

.project-status--active {
    color: #0f766e;
    background: rgba(16, 185, 129, 0.14);
    border-color: rgba(16, 185, 129, 0.18);
}

.project-status--archived {
    color: #5b6676;
    background: #eef2f6;
    border-color: #d8e0e8;
}
</style>
