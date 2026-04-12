<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        status: string
        subtle?: boolean
    }>(),
    {
        subtle: false,
    }
)

const toneClass = computed(() => {
    const normalized = props.status.toLowerCase()
    if (normalized === "approved") return "status-badge--approved"
    if (normalized === "rejected") return "status-badge--rejected"
    return "status-badge--pending"
})
</script>

<template>
    <span class="status-badge" :class="[toneClass, { 'status-badge--subtle': subtle }]">
        {{ status }}
    </span>
</template>

<style scoped>
.status-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 1px solid transparent;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
}

.status-badge--pending {
    background: var(--warning-soft);
    color: var(--warning);
    border-color: #f8ddb9;
}

.status-badge--approved {
    background: var(--success-soft);
    color: var(--success);
    border-color: #cbe9d4;
}

.status-badge--rejected {
    background: var(--danger-soft);
    color: var(--danger);
    border-color: #f7cfcf;
}

.status-badge--subtle {
    min-height: 24px;
    padding: 0 8px;
}
</style>
